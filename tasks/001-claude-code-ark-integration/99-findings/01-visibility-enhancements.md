# Visibility Enhancements

Side discovery from Claude Code Ark integration exploration.

## Context

During integration, we identified that OTEL traces are emitted by claude-code-agent but not yet visible in Ark's centralized observability.

## Immediate Options

### Option 1: Configure OTEL Export to Ark Broker

Set environment variables to route telemetry to Ark Broker's OTLP endpoint.

```yaml
env:
  CLAUDE_CODE_ENABLE_TELEMETRY: "1"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://ark-broker:3000"
```

**Pros:** Works today, shows tool/model calls
**Cons:** Debugging-focused, not text streaming

### Option 2: Use A2A Artifacts

Claude Code agent can update artifacts during execution. Ark captures these in A2ATask status.

```typescript
// In claude-code-executor.ts, update artifact with logs
await a2a.updateArtifact({
  name: "execution-log",
  mimeType: "text/plain",
  data: logContent
});
```

**Pros:** Richer visibility than traces alone
**Cons:** Requires claude-code-agent changes

## Future Options (Require Ark Changes)

### Async A2A Mode + A2ATask Polling

```
Query -> A2A (Blocking: false) -> A2ATask created immediately
                                      |
                        A2ATaskReconciler polls every 5s
                                      |
                        status.history updated with messages
```

**Changes:** Set `Blocking: false`, create A2ATask before completion
**Pros:** K8s-native, uses existing infrastructure
**Cons:** 5s polling interval, not true streaming

### SSE Streaming via tasks/sendSubscribe

```
Query -> A2A sendSubscribe (SSE) -> Real-time StatusUpdate events
                                      |
                        Ark forwards to EventStreamInterface
```

**Changes:** Implement `tasks/sendSubscribe` in Ark A2A client
**Pros:** True real-time, shows tool calls and text
**Cons:** More complex implementation

## Recommendation

Start with Option 1 (OTEL export). It provides basic visibility with zero code changes to either Ark or claude-code-agent, just Helm configuration.

## Status

Not blocking for initial integration. Can be pursued after core integration is verified.
