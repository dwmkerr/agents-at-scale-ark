# Verification

Maps acceptance criteria to evidence.

## Acceptance Criteria

### Core Integration

| Criterion | How to Verify | Status |
|-----------|---------------|--------|
| A2AServer shows Ready | `kubectl get a2aserver claude-code -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'` returns "True" | pending |
| Agent CRD auto-created | `kubectl get agent claude-code` succeeds | pending |
| Agent has executionEngine: a2a | `kubectl get agent claude-code -o yaml` shows `spec.executionEngine: a2a` | pending |
| Query returns response | `ark query agent/claude-code "Hello"` returns text | pending |

### Observability

| Criterion | How to Verify | Status |
|-----------|---------------|--------|
| OTEL traces emitted | Agent logs show span export or collector receives spans | pending |
| Trace context propagated | Spans have parent trace ID from Ark request | pending |

### Optional (Follow-on)

| Criterion | How to Verify | Status |
|-----------|---------------|--------|
| OTEL visible in Ark Broker | `/v1/traces` API returns spans from claude-code-agent | deferred |
| A2A artifacts capture logs | A2ATask `.status.artifacts` populated | deferred |

## Evidence Collection

### Deployment Evidence

```bash
# Capture deployment state
kubectl get pods -l app=claude-code-agent -o yaml > evidence/pods.yaml
kubectl get a2aserver claude-code -o yaml > evidence/a2aserver.yaml
kubectl get agent claude-code -o yaml > evidence/agent.yaml
```

### Query Evidence

```bash
# Capture query response
ark query agent/claude-code "What is 2+2?" > evidence/query-response.txt
```

### OTEL Evidence

```bash
# Capture agent logs showing telemetry
kubectl logs -l app=claude-code-agent --tail=100 > evidence/agent-logs.txt
```

## Gaps

- **Streaming**: A2A uses blocking mode; no intermediate text streaming
- **Dashboard visibility**: Traces not yet visible in Ark Dashboard
- **Multi-turn context**: Session management needs validation

## Success Definition

Integration is complete when:
1. A2AServer and Agent CRDs are Ready
2. Queries execute and return responses
3. OTEL traces are emitted by claude-code-agent

Follow-on work for enhanced visibility is documented in `99-findings/`.
