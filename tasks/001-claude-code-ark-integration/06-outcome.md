# Outcome

## Summary

**Ark already has native A2A support.** Integration requires zero code changes to Ark.

The initial analysis incorrectly assumed we needed to modify the execution engine or build new integration code. After examining Ark's architecture:

1. **Ark has a native Go agentic loop** (`executeLocally`) as the default execution path
2. **Execution engines are optional overrides** for external systems
3. **`a2a` is a reserved execution engine name** with built-in support
4. **A2AServer CRD + controller** handles discovery and agent creation automatically

## Key Learnings

1. **Ark's architecture is more sophisticated than initially understood** - The native Go loop handles most agent work; execution engines are for "swapping out" to external systems

2. **A2A is first-class in Ark** - Full client implementation, auto-discovery, agent creation, OTEL header injection

3. **Zero-code integration is possible** - Deploy claude-code-agent, create A2AServer CRD, done

4. **OTEL flows through A2A** - Ark injects trace headers via `telemetry.InjectOTELHeaders()` in `a2a.go:188-192`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use existing A2A support | Zero code changes, already production-ready |
| Don't modify executor-langchain | Wrong abstraction - that's for HTTP engines, not A2A |
| Leverage Helm chart | claude-code-agent already has working Helm deployment |
| Multiple deployments for multi-agent | Each Helm release = separate A2AServer = separate Agent |
| Start with OTEL for visibility | Minimal change, works today |

## Integration Steps

```bash
# 1. Deploy claude-code-agent with OTEL
helm install claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --set apiKey=$ANTHROPIC_API_KEY \
  --set env.CLAUDE_CODE_ENABLE_TELEMETRY=1

# 2. Create A2AServer
kubectl apply -f - <<EOF
apiVersion: ark.mckinsey.com/v1prealpha1
kind: A2AServer
metadata:
  name: claude-code
spec:
  address:
    value: "http://claude-code-agent:2222"
  timeout: "30m"
EOF

# 3. Verify discovery
kubectl get a2aserver
kubectl get agent

# 4. Query
ark query agent/claude-code "Hello"
```

## Follow-on Work

### Immediate (Visibility Enhancements)

| Task | Description |
|------|-------------|
| Configure OTEL export to Ark Broker | Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://ark-broker:3000` to centralize traces |
| Use A2A artifacts | Claude Code agent can update artifacts (e.g., logs) that Ark captures in A2ATask |

### Future Enhancements

| Task | Description |
|------|-------------|
| Multi-agent Helm values | Document configs for specialized agents (research, coding, etc.) |
| Marketplace integration | Package as marketplace component |
| Async A2A mode | Enable real-time status via A2ATask polling (requires Ark changes) |
| SSE streaming | True real-time intermediate text (requires Ark A2A client changes) |

## Known Limitations

1. **No streaming currently** - A2A execution engine sends final response as single chunk
2. **Blocking mode** - Ark's A2A client uses `Blocking: true` (see `a2a.go:143-153`)
3. **Skills annotation** - Skills from agent card stored in annotation, not exposed in UI
4. **Session management** - Context ID passed but multi-turn behavior unclear

## Key Code References

| Component | File | Line |
|-----------|------|------|
| A2A reserved constant | `ark/internal/genai/a2a_types.go` | 10 |
| A2A routing decision | `ark/internal/genai/agent.go` | 79 |
| A2A execution | `ark/internal/genai/a2a_execution.go` | 34-132 |
| A2A blocking config | `ark/internal/genai/a2a.go` | 143-153 |
| OTEL header injection | `ark/internal/genai/a2a.go` | 188-192 |
| A2AServer controller | `ark/internal/controller/a2aserver_controller.go` | 51-367 |
| A2ATask controller (polling) | `ark/internal/controller/a2atask_controller.go` | 37-98 |
| claude-code-agent StatusUpdate | `src/claude-code-executor.ts` | 192-209 |
