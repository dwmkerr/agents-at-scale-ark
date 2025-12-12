---
owner: ark-protocol-orchestrator
description: Architecture for measuring query reconciliation load capacity
---

# Query Load Capacity Architecture

## Overview

This document outlines an approach to measure and understand the load capacity of the Ark controller's query reconciliation. The current architecture processes queries in a single controller pod using controller-runtime's workqueue with goroutine-based execution. Understanding capacity limits enables informed decisions about when to scale horizontally or vertically, and which components need optimization.

## Current Query Reconciliation Architecture

### Component Diagram

```
                           Kubernetes API Server
                                    |
                        +----------+----------+
                        |    Watch Events     |
                        v                     v
           +------------------------+    +------------------------+
           |  controller-runtime    |    |  controller-runtime    |
           |  Work Queue            |    |  Informer Cache        |
           |  (rate-limited)        |    |  (indexed by ns/name)  |
           +------------------------+    +------------------------+
                        |
                        v
           +------------------------+
           |  Query Reconciler      |
           |  Reconcile() method    |
           +------------------------+
                        |
       +----------------+----------------+
       |                                 |
       v                                 v
+---------------+              +------------------+
| Status Update |              | Async Execution  |
| (sync path)   |              | (goroutine)      |
+---------------+              +------------------+
                                        |
                   +--------------------+--------------------+
                   |                    |                    |
                   v                    v                    v
           +-------------+      +-------------+      +-------------+
           | Load Model  |      | Load Memory |      | Load Tools  |
           | (K8s Get)   |      | (HTTP/K8s)  |      | (MCP/K8s)   |
           +-------------+      +-------------+      +-------------+
                   |
                   v
           +-------------+
           | LLM Call    |  <-- Primary bottleneck (seconds)
           | (HTTP)      |
           +-------------+
                   |
                   v
           +-------------+
           | Tool Calls  |  <-- Secondary bottleneck (variable)
           | (MCP/HTTP)  |
           +-------------+
```

### Key Bottlenecks Analysis

| Component | Typical Latency | Concurrency Impact | Notes |
|-----------|----------------|-------------------|-------|
| K8s API Watch | 10-50ms | Low | Shared informer cache |
| Query reconcile start | 1-5ms | Medium | Work queue dequeue |
| Status update | 10-30ms | Medium | API server write |
| Model loading (cached) | 1-5ms | Low | In-memory after first load |
| Model loading (cold) | 50-200ms | Low | Secret/ConfigMap resolution |
| Memory load | 10-100ms | Medium | HTTP to postgres-memory |
| LLM API call | 1-60s | **High** | Primary bottleneck, variable |
| Tool execution | 100ms-30s | **High** | MCP server dependent |
| Final status update | 10-30ms | Medium | API server write |

### Current Concurrency Model

The `query_controller.go` shows:

1. **Single reconcile per Query** - controller-runtime ensures one reconcile per resource key at a time
2. **Goroutine per execution** - `executeQueryAsync` runs in a goroutine with cancellation support
3. **sync.Map for operations** - Tracks in-flight operations to prevent duplicate execution
4. **No explicit concurrency limit** - controller-runtime defaults apply (typically MaxConcurrentReconciles=1)
5. **Parallel target execution** - Multiple targets execute concurrently via goroutines

```go
// From query_controller.go:425
func (r *QueryReconciler) executeTargetsInParallel(...) {
    resultChan := make(chan targetResult, len(targets))
    var wg sync.WaitGroup
    for _, target := range targets {
        wg.Add(1)
        go func(target arkv1alpha1.QueryTarget) {
            defer wg.Done()
            executionResult, err := r.executeTarget(...)
            resultChan <- targetResult{...}
        }(target)
    }
    wg.Wait()
}
```

## Metrics to Measure

### 1. Controller-Runtime Built-in Metrics

controller-runtime exposes Prometheus metrics at `/metrics`. Key workqueue metrics:

```
# Work queue depth (queries waiting to be processed)
workqueue_depth{name="query"}

# Queue latency (time from add to start processing)
workqueue_queue_duration_seconds{name="query"}

# Processing latency (time spent in Reconcile)
workqueue_work_duration_seconds{name="query"}

# Reconciliation rate
workqueue_adds_total{name="query"}
workqueue_retries_total{name="query"}

# Controller reconcile errors
controller_runtime_reconcile_errors_total{controller="query"}
controller_runtime_reconcile_total{controller="query",result="success|error|requeue"}
```

### 2. Custom Metrics to Add

Add application-level metrics for deeper insight:

```go
// Recommended metrics to add in query_controller.go
var (
    queryExecutionDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "ark_query_execution_duration_seconds",
            Help:    "Time from query start to completion",
            Buckets: prometheus.ExponentialBuckets(0.1, 2, 12), // 100ms to 6+ minutes
        },
        []string{"namespace", "target_type", "status"},
    )

    queryConcurrentExecutions = prometheus.NewGauge(
        prometheus.GaugeOpts{
            Name: "ark_query_concurrent_executions",
            Help: "Number of queries currently executing",
        },
    )

    llmCallDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "ark_llm_call_duration_seconds",
            Help:    "LLM API call latency",
            Buckets: prometheus.ExponentialBuckets(0.5, 2, 10), // 500ms to 8+ minutes
        },
        []string{"model", "provider"},
    )

    toolCallDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "ark_tool_call_duration_seconds",
            Help:    "Tool execution latency",
            Buckets: prometheus.ExponentialBuckets(0.05, 2, 10),
        },
        []string{"tool_name", "tool_type"},
    )
)
```

### 3. OTEL Spans (Already Implemented)

The existing telemetry layer (`/ark/internal/telemetry/`) already records:

- Query execution spans with session ID
- Target execution spans (agent, team, model, tool)
- Model call spans with token usage
- Tool execution spans

Use these for distributed tracing analysis in Langfuse/Phoenix.

## Load Testing Approach

### Strategy 1: Unit Load Test (Isolated Controller)

Test the controller in isolation with mocked LLM responses:

```go
// ark/internal/controller/query_controller_load_test.go
func BenchmarkQueryReconciliation(b *testing.B) {
    // Setup test environment with mock LLM server
    mockLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        time.Sleep(100 * time.Millisecond) // Simulate LLM latency
        json.NewEncoder(w).Encode(openai.ChatCompletion{...})
    }))

    // Create N queries and measure throughput
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            query := createTestQuery()
            reconciler.Reconcile(ctx, ctrl.Request{...})
        }
    })
}
```

### Strategy 2: Integration Load Test (Full Stack)

Use a load generator against a real cluster:

```yaml
# samples/load-test/query-generator.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: query-load-generator
spec:
  parallelism: 10
  template:
    spec:
      containers:
      - name: generator
        image: ghcr.io/mckinsey/ark-load-test:latest
        env:
        - name: QUERIES_PER_SECOND
          value: "5"
        - name: DURATION_SECONDS
          value: "300"
        - name: TARGET_AGENT
          value: "test-agent"
```

### Strategy 3: k6 or Locust Load Test

For API-level testing:

```javascript
// load-tests/k6/query-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp to 10 concurrent
    { duration: '5m', target: 10 },   // Hold
    { duration: '2m', target: 50 },   // Ramp to 50
    { duration: '5m', target: 50 },   // Hold
    { duration: '2m', target: 0 },    // Ramp down
  ],
};

export default function () {
  const query = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Query',
    metadata: {
      generateName: 'load-test-',
      namespace: 'load-test',
    },
    spec: {
      input: JSON.stringify('What is 2+2?'),
      targets: [{ type: 'model', name: 'test-model' }],
      ttl: '5m',
    },
  };

  const res = http.post(
    `${__ENV.K8S_API}/apis/ark.mckinsey.com/v1alpha1/namespaces/load-test/queries`,
    JSON.stringify(query),
    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${__ENV.TOKEN}` } }
  );

  check(res, { 'created': (r) => r.status === 201 });
  sleep(1);
}
```

## Benchmarking Configuration

### Test Scenarios

| Scenario | Queries | Concurrency | LLM Latency | Tools | Expected Throughput |
|----------|---------|-------------|-------------|-------|-------------------|
| Baseline | 100 | 1 | 1s (mock) | None | ~1 qps |
| Concurrent | 100 | 10 | 1s (mock) | None | ~10 qps |
| High Load | 1000 | 50 | 1s (mock) | None | ~50 qps (expected limit) |
| Realistic | 100 | 10 | 5-30s (real) | 3 tools | ~0.3 qps |
| Memory Test | 100 | 10 | 1s | None | Memory baseline |

### Controller Tuning Parameters

Add these to the controller setup to control capacity:

```go
// cmd/main.go - add MaxConcurrentReconciles
func setupControllers(mgr ctrl.Manager, ...) {
    queryReconciler := &controller.QueryReconciler{...}

    if err := ctrl.NewControllerManagedBy(mgr).
        For(&arkv1alpha1.Query{}).
        WithOptions(controller.Options{
            MaxConcurrentReconciles: 10,  // Default is 1
            RateLimiter: workqueue.NewTypedItemExponentialFailureRateLimiter[reconcile.Request](
                time.Millisecond*100,  // Base delay
                time.Second*30,        // Max delay
            ),
        }).
        Complete(queryReconciler); err != nil {
        setupLog.Error(err, "unable to create controller")
        os.Exit(1)
    }
}
```

### Resource Limits Impact

Current Helm values:
```yaml
resources:
  limits:
    cpu: 500m
    memory: 128Mi
  requests:
    cpu: 10m
    memory: 64Mi
```

Test with increased limits:
```yaml
resources:
  limits:
    cpu: 2000m
    memory: 512Mi
```

## Capacity Indicators and Thresholds

### Signs of Controller at Capacity

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|------------------|-------------------|--------|
| `workqueue_depth{name="query"}` | >50 | >200 | Scale replicas or increase MaxConcurrent |
| `workqueue_queue_duration_seconds` p99 | >5s | >30s | Scale or reduce load |
| `workqueue_work_duration_seconds` p99 | >60s | >300s | Optimize or accept |
| `controller_runtime_reconcile_errors_total` rate | >1/min | >10/min | Investigate errors |
| Pod CPU usage | >80% | >95% | Increase CPU limit |
| Pod memory usage | >80% | >95% | Increase memory limit |
| `ark_query_concurrent_executions` | >20 | >50 | Scale horizontally |

### Scaling Decision Matrix

| Symptom | Root Cause | Solution |
|---------|-----------|----------|
| High queue depth, low CPU | MaxConcurrentReconciles too low | Increase MaxConcurrentReconciles |
| High CPU, high queue depth | Controller CPU-bound | Increase CPU limits or add replicas |
| High memory, OOM restarts | Too many concurrent queries | Limit concurrency, add memory |
| High latency, low throughput | LLM bottleneck | Can't solve at controller level |
| API server errors | Rate limiting | Add backoff, reduce query creation rate |

## Implementation Phases

### Phase 1: Instrumentation (1-2 days)

1. Add custom Prometheus metrics to query controller
2. Verify controller-runtime workqueue metrics are exposed
3. Create Grafana dashboard for query throughput

### Phase 2: Load Test Framework (2-3 days)

1. Create mock LLM server for isolated testing
2. Write benchmark tests in `query_controller_load_test.go`
3. Create k6/Locust scripts for integration testing

### Phase 3: Baseline Measurement (1 day)

1. Run tests with default configuration
2. Document baseline throughput and latency
3. Identify initial bottlenecks

### Phase 4: Tuning and Optimization (2-3 days)

1. Test with different MaxConcurrentReconciles values
2. Test with different resource limits
3. Profile controller for optimization opportunities

### Phase 5: Documentation and Monitoring (1 day)

1. Document capacity limits
2. Create runbook for scaling decisions
3. Set up alerts for capacity indicators

## One-Way Decisions

### Questions for Team Discussion

1. **MaxConcurrentReconciles default value** - Should we change from 1 to a higher default (e.g., 10)? Higher values mean more concurrent goroutines but also more API server load.

2. **Horizontal vs vertical scaling** - Should the controller support running multiple replicas with leader election only for specific controllers? Currently leader election is all-or-nothing.

3. **Rate limiting strategy** - Should we implement application-level rate limiting to protect downstream LLM APIs, or leave that to the LLM provider's rate limits?

4. **Query executor separation** - The comments in the code mention future "per-namespace query executor pods". Should this load analysis influence the timeline for that architectural change?

## Files Referenced

- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/internal/controller/query_controller.go` - Main reconciliation logic
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/cmd/main.go` - Controller setup and configuration
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/internal/telemetry/config/provider.go` - Telemetry configuration
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/internal/genai/agent.go` - Agent execution with tool calls
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/dist/chart/values.yaml` - Helm chart with resource limits
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/config/prometheus/monitor.yaml` - ServiceMonitor for metrics
