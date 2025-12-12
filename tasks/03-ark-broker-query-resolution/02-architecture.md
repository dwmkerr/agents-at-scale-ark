---
owner: ark-architect
description: Architecture for distributed query reconciliation in Ark
---

# Distributed Query Reconciliation Architecture

## Overview

The Ark controller currently runs query reconciliation in a single process with in-memory state tracking via `sync.Map`. This design explores options for distributing query execution workload across multiple processes while maintaining Kubernetes-native patterns. The recommended approach uses namespace-scoped Query Executor deployments that handle the compute-intensive execution work while the central controller retains orchestration responsibility.

## Current Architecture Analysis

### How Query Reconciliation Works Today

The `QueryReconciler` in `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/internal/controller/query_controller.go` follows this flow:

```
Query Created
    |
    v
Reconcile() called
    |
    +-- Check TTL expiry
    +-- Handle finalizer
    +-- Initialize conditions if empty
    |
    v
handleQueryExecution()
    |
    +-- Check for cancel request
    +-- Switch on phase:
        - done/error/canceled: Requeue at TTL expiry
        - running: Check if operation exists in sync.Map
        - default: Set phase to "running"
    |
    v
handleRunningPhase()
    |
    +-- If operation exists in sync.Map: return (already running)
    +-- Create cancelable context
    +-- Store cancel func in sync.Map
    +-- Launch goroutine: executeQueryAsync()
```

### Key Characteristics

1. **In-Memory State**: Operations tracked in `sync.Map` keyed by `types.NamespacedName`
2. **Single Process**: All execution happens in goroutines within one controller pod
3. **Impersonation**: Controller impersonates the query's service account for RBAC
4. **Async Execution**: Long-running LLM calls in goroutines, status updates via Kubernetes API
5. **Leader Election**: Single active controller with `--leader-elect` flag

### Scalability Limitations

| Limitation | Impact |
|------------|--------|
| Single controller | Memory/CPU bottleneck for concurrent queries |
| In-memory sync.Map | State lost on pod restart; no HA failover |
| Impersonation scope | Controller needs cluster-wide impersonation RBAC |
| No namespace isolation | All queries compete for same resources |

## Component Diagram

```
                         Current Architecture
+-------------------------------------------------------------------------+
|                                                                         |
|  +------------------+     +-------------------+     +----------------+  |
|  | Query CRD        |     | ark-controller    |     | Target CRDs    |  |
|  | (namespace: foo) +---->| (single replica)  +---->| Agent/Model/   |  |
|  +------------------+     |                   |     | Team           |  |
|  +------------------+     | - query_controller|     +----------------+  |
|  | Query CRD        +---->| - sync.Map state  |                        |
|  | (namespace: bar) |     | - goroutines      |     +----------------+  |
|  +------------------+     +-------------------+     | LLM Providers  |  |
|                                  |                  | (external)     |  |
|                                  +----------------->+----------------+  |
|                                                                         |
+-------------------------------------------------------------------------+


                        Proposed Architecture
+-------------------------------------------------------------------------+
|                                                                         |
|  +------------------+     +-------------------+                         |
|  | Query CRD        |     | ark-controller    |     +----------------+  |
|  | (namespace: foo) +---->| (orchestration)   |     | Target CRDs    |  |
|  +------------------+     | - query status    |     | Agent/Model/   |  |
|  +------------------+     | - phase mgmt      |     | Team           |  |
|  | Query CRD        +---->| - NO execution    |     +----------------+  |
|  | (namespace: bar) |     +--------+----------+                        |
|  +------------------+              |                                    |
|                                    | Watch/Update                       |
|                         +----------+-----------+                        |
|                         |                      |                        |
|              +----------v--------+  +----------v--------+               |
|              | QueryExecutor     |  | QueryExecutor     |               |
|              | (namespace: foo)  |  | (namespace: bar)  |               |
|              |                   |  |                   |               |
|              | - Watches queries |  | - Watches queries |  +----------+ |
|              | - Executes LLM    |  | - Executes LLM    +->| LLM      | |
|              | - Updates status  |  | - Updates status  |  | Providers| |
|              +-------------------+  +-------------------+  +----------+ |
|                                                                         |
+-------------------------------------------------------------------------+
```

## Distribution Options

### Option 1: Horizontal Scaling with Sharding

**Approach**: Multiple controller replicas with label-based sharding.

```yaml
# Query with shard label
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: my-query
  labels:
    ark.mckinsey.com/shard: "shard-0"  # Assigned on creation
```

**Implementation**:
- Mutating webhook assigns shard label (hash of namespace/name)
- Each controller replica watches only its shard
- `WithLabelSelector` predicate in controller setup

**Pros**:
- Simple to implement with controller-runtime
- No new components

**Cons**:
- Rebalancing on replica change is complex
- Shard assignment webhook adds latency
- State still lost on individual replica restart

### Option 2: External Work Queue

**Approach**: Controller enqueues work items; separate workers process them.

```
Controller  -->  Redis/SQS/NATS  -->  Worker Pool
(enqueue)        (work queue)         (execute)
```

**Implementation**:
- Controller creates queue item on Query creation
- Workers claim items, execute, update Query status
- Redis BRPOPLPUSH for reliable dequeue

**Pros**:
- Decoupled scaling of workers
- Existing queue infrastructure

**Cons**:
- New infrastructure dependency
- Complex failure handling
- Loses Kubernetes-native patterns

### Option 3: Namespace-Scoped Query Executors (Recommended)

**Approach**: Per-namespace deployments that watch and execute queries in their namespace.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: query-executor
  namespace: tenant-a
spec:
  replicas: 2  # Scale per namespace needs
  template:
    spec:
      containers:
      - name: executor
        env:
        - name: WATCH_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
```

**Implementation**:
- QueryExecutor watches Queries in its namespace only
- Uses namespace-scoped ServiceAccount (no impersonation)
- Central controller only manages lifecycle phases
- Executors handle actual LLM execution

**Pros**:
- Namespace isolation (multi-tenant friendly)
- Scale independently per tenant
- Simpler RBAC (no cluster-wide impersonation)
- Kubernetes-native (just deployments)

**Cons**:
- More resources (executor per namespace)
- Coordination between controller and executor

### Option 4: Separate Query Controller

**Approach**: Extract query reconciliation to a dedicated controller deployment.

**Implementation**:
- Remove `QueryReconciler` from main controller
- Deploy `ark-query-controller` with same logic
- Main controller handles all other resources

**Pros**:
- Independent scaling of query processing
- Cleaner separation of concerns

**Cons**:
- Still single-process for queries
- Doesn't solve fundamental scalability

### Option 5: Job-Based Execution

**Approach**: Create a Kubernetes Job for each Query execution.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: query-abc123-exec
  ownerReferences:
  - apiVersion: ark.mckinsey.com/v1alpha1
    kind: Query
    name: abc123
spec:
  template:
    spec:
      containers:
      - name: executor
        image: ark-query-executor:latest
        env:
        - name: QUERY_NAME
          value: abc123
        - name: QUERY_NAMESPACE
          value: default
```

**Implementation**:
- Controller creates Job on Query creation
- Job runs to completion, updates Query status
- Garbage collected via ownerReferences

**Pros**:
- Natural fit for one-shot workloads
- Kubernetes handles scheduling/retry
- Resource limits per query

**Cons**:
- Job startup latency (~2-5s)
- Many Jobs if high query throughput
- Complex streaming (need sidecar or external service)

## Trade-off Analysis

| Criteria | Sharding | Work Queue | Namespace Executor | Separate Controller | Jobs |
|----------|----------|------------|-------------------|---------------------|------|
| Implementation Complexity | Medium | High | Medium | Low | Medium |
| Operational Complexity | High | High | Medium | Low | Medium |
| Namespace Isolation | None | None | Full | None | Partial |
| Scaling Granularity | Cluster | Worker pool | Per namespace | Single | Per query |
| Multi-tenancy Support | Poor | Poor | Excellent | Poor | Good |
| Startup Latency | None | Queue delay | None | None | 2-5s |
| Streaming Support | Yes | Complex | Yes | Yes | Complex |
| RBAC Simplification | No | No | Yes | No | Yes |

## Recommended Architecture: Namespace-Scoped Query Executors

### Rationale

1. **Multi-tenancy**: Ark targets enterprise deployments with multiple teams. Namespace isolation is essential.
2. **RBAC**: Eliminates cluster-wide impersonation. Executors use namespace-scoped service accounts.
3. **Scaling**: Each namespace can scale independently based on workload.
4. **Kubernetes-native**: No external dependencies. Standard Deployments with leader election.
5. **Incremental adoption**: Can run alongside existing controller; migrate namespaces gradually.

### Architecture Detail

#### Central Controller Responsibilities

The main ark-controller retains:
- Query lifecycle management (creation, deletion, TTL)
- Phase transitions (pending -> assigned -> running -> done)
- Webhook validation
- All other CRD reconciliation (Agent, Team, Model, etc.)

The controller does NOT:
- Execute queries
- Make LLM calls
- Track in-memory operation state

#### Query Executor Responsibilities

Per-namespace QueryExecutor handles:
- Watching Queries in assigned namespace
- Executing queries (LLM calls, tool execution)
- Updating Query status with responses
- Streaming via ark-cluster-memory
- Memory/conversation persistence

### Data Model Changes

#### Query CRD Status Extension

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: my-query
  namespace: tenant-a
spec:
  input: "What is the weather?"
  targets:
    - type: agent
      name: weather-agent
status:
  phase: "running"  # pending | assigned | running | done | error | canceled
  conditions:
    - type: Completed
      status: "False"
      reason: "QueryRunning"
  assignedExecutor: "query-executor-5f7b8c9d-abc12"  # Pod name
  assignedAt: "2024-01-15T10:30:00Z"
  responses:
    - target:
        type: agent
        name: weather-agent
      content: "The weather is sunny"
      phase: done
```

New fields:
- `status.assignedExecutor`: Pod that claimed this query
- `status.assignedAt`: When execution was assigned

#### QueryExecutor CRD (Optional)

For declarative executor configuration:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: QueryExecutor
metadata:
  name: default
  namespace: tenant-a
spec:
  replicas: 2
  resources:
    requests:
      memory: 512Mi
      cpu: 500m
    limits:
      memory: 2Gi
      cpu: 2
  concurrency: 10  # Max concurrent queries per replica
status:
  readyReplicas: 2
  activeQueries: 5
```

This CRD is optional - executors can also be deployed directly as Deployments.

### Execution Flow

```
1. User creates Query
   |
   v
2. Central Controller Reconcile
   |-- Validate Query spec
   |-- Add finalizer
   |-- Set phase: "pending"
   |-- Set condition: QueryNotStarted
   |
   v
3. Query Executor (in namespace) Watches
   |-- Filter: phase == "pending"
   |-- Claim query: Set phase: "assigned", assignedExecutor: self
   |
   v
4. Query Executor Reconcile (same pod)
   |-- Filter: assignedExecutor == self
   |-- Set phase: "running"
   |-- Execute query (LLM calls, tools)
   |-- Update status.responses
   |-- Set phase: "done" or "error"
   |
   v
5. Central Controller Finalizer (on delete)
   |-- Cleanup operations
   |-- Remove finalizer
```

### Leader Election for Executors

Each namespace can have multiple executor replicas. To avoid duplicate processing:

1. **Claim-based**: First executor to set `assignedExecutor` wins (optimistic locking)
2. **Leader election**: Single active executor per namespace (simpler but less scalable)

Recommended: **Claim-based** with conflict resolution:

```go
func (r *QueryExecutor) claimQuery(ctx context.Context, query *arkv1alpha1.Query) error {
    query.Status.Phase = "assigned"
    query.Status.AssignedExecutor = r.podName
    query.Status.AssignedAt = metav1.Now()

    err := r.Status().Update(ctx, query)
    if errors.IsConflict(err) {
        // Another executor claimed it
        return nil
    }
    return err
}
```

### RBAC Configuration

#### Central Controller (cluster-scoped)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ark-controller-role
rules:
- apiGroups: ["ark.mckinsey.com"]
  resources: ["queries"]
  verbs: ["get", "list", "watch", "update", "patch"]
- apiGroups: ["ark.mckinsey.com"]
  resources: ["queries/status"]
  verbs: ["get", "update", "patch"]
# Other CRDs...
```

#### Query Executor (namespace-scoped)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: query-executor-role
  namespace: tenant-a
rules:
- apiGroups: ["ark.mckinsey.com"]
  resources: ["queries"]
  verbs: ["get", "list", "watch", "update", "patch"]
- apiGroups: ["ark.mckinsey.com"]
  resources: ["queries/status"]
  verbs: ["get", "update", "patch"]
- apiGroups: ["ark.mckinsey.com"]
  resources: ["agents", "models", "teams", "tools", "mcpservers"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["secrets", "configmaps"]
  verbs: ["get", "list"]
```

No impersonation required - executor runs with namespace service account.

## One-Way Decisions

These decisions significantly affect future architecture and should be discussed before implementation:

1. **Query claim mechanism**: Should executors claim queries via status update (optimistic) or use a distributed lock (Redis/etcd)? Optimistic is simpler but may have race conditions under high load.

2. **Executor deployment model**: Should executors be managed by a CRD (QueryExecutor) or deployed as standard Deployments? CRD enables declarative management but adds controller complexity.

3. **Streaming architecture**: Should executors connect directly to ark-cluster-memory or use a sidecar? Direct is simpler; sidecar enables connection pooling.

4. **Failure handling**: When an executor pod dies mid-execution, should the query be automatically reassigned or require manual intervention? Automatic reassign risks duplicate LLM calls.

5. **Migration strategy**: Should we support running both architectures simultaneously (for gradual migration) or do a big-bang switch?

## Implementation Phases

### Phase 1: Query Status Extension

Add new status fields to Query CRD without changing execution:
- `status.assignedExecutor`
- `status.assignedAt`
- New phase value: `assigned`

**Value**: Groundwork for executor model; no breaking changes.

### Phase 2: Query Executor Implementation

Create `ark-query-executor` binary that:
- Watches single namespace
- Claims and executes queries
- Uses existing genai package for execution

**Value**: Namespace-isolated execution; can test in single namespace.

### Phase 3: Controller Delegation

Modify central controller to:
- Stop executing queries
- Only manage lifecycle phases
- Add validation that executor exists for namespace

**Value**: Clean separation of concerns; reduced controller load.

### Phase 4: Executor CRD (Optional)

Add QueryExecutor CRD for declarative management:
- Executor controller creates/manages Deployments
- Status aggregation across replicas

**Value**: Simplified operations; GitOps-friendly configuration.

### Phase 5: Migration Tooling

Create tools for:
- Migrating namespaces from controller to executor
- Monitoring query distribution
- Capacity planning per namespace

**Value**: Safe production rollout; operational visibility.

## Alternative: Hybrid Approach

If full namespace isolation is not immediately needed, a simpler hybrid:

1. **Short-term**: Increase `MaxConcurrentReconciles` in controller-runtime
2. **Medium-term**: Extract to separate query controller deployment
3. **Long-term**: Implement namespace executors when multi-tenancy is required

This delays complexity while improving immediate scalability.

## Related Work

- [tasks/01-ark-broker-and-questions/02-architecture.md](/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/tasks/01-ark-broker-and-questions/02-architecture.md) - Questions/broker integration
- [tasks/02-ark-broker-otel-eventing/02-architecture.md](/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/tasks/02-ark-broker-otel-eventing/02-architecture.md) - OTEL eventing for session tracking
- [ark/internal/controller/query_controller.go](/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/internal/controller/query_controller.go) - Current implementation
