# Architecture: Claude Code + Ark Integration

## Summary

**Ark already has native A2A support.** The integration requires zero code changes to Ark.

## Ark's Agentic Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           QUERY CONTROLLER                               │
│  (Kubernetes reconciliation loop for Query CRDs)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Target Type Router        │
                    │  (agent/team/model/tool)      │
                    └───────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │  Native Go Loop   │           │  Execution Engine │
        │  (executeLocally) │           │  (if specified)   │
        └───────────────────┘           └───────────────────┘
                │                               │
                │                     ┌─────────┴─────────┐
                │                     ▼                   ▼
                │             ┌─────────────┐     ┌─────────────┐
                │             │  A2A Engine │     │ HTTP Engine │
                │             │  (reserved) │     │ (langchain) │
                │             └─────────────┘     └─────────────┘
                │                     │
                ▼                     ▼
        ┌───────────────┐     ┌───────────────────────┐
        │ Multi-turn    │     │ External A2A Server   │
        │ tool-calling  │     │ (claude-code-agent)   │
        │ loop          │     └───────────────────────┘
        └───────────────┘
```

### Key Architecture Points

1. **Native Go Implementation** (`ark/internal/genai/agent.go:executeLocally`)
   - Default execution path for agents
   - Multi-turn tool-calling loop built into the controller
   - Supports all tool types: HTTP, MCP, Agent, Team, Builtin

2. **Execution Engine Pattern** (`agent.go:66-88`)
   - Optional override when `.spec.executionEngine` is set
   - Routes to external systems (LangChain, A2A, etc.)
   - **`a2a` is a reserved execution engine name**

3. **A2A Execution Engine** (`ark/internal/genai/a2a_execution.go`)
   - Handles `executionEngine: a2a` agents
   - Communicates via Google's A2A JSON-RPC protocol
   - Injects OTEL trace headers for observability

## A2A Integration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Deploy claude-code-agent (Helm or DevSpace)                         │
│    └── Runs A2A server at http://claude-code-agent:2222                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Create A2AServer CRD                                                 │
│    apiVersion: ark.mckinsey.com/v1prealpha1                            │
│    kind: A2AServer                                                      │
│    spec:                                                                │
│      address:                                                           │
│        value: "http://claude-code-agent:2222"                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. A2AServerReconciler auto-discovers agent                            │
│    └── GET /.well-known/agent-card.json                                │
│    └── Creates Agent CRD with executionEngine: a2a                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. User queries agent via Ark API/Dashboard                            │
│    POST /api/v1/query { target: "agent/claude-code", message: "..." }  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Query Controller routes to A2AExecutionEngine                       │
│    └── Sends JSON-RPC message/stream to claude-code-agent              │
│    └── Injects OTEL headers (traceparent, tracestate)                  │
│    └── Returns response to user                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Observability Path

```
┌─────────────┐     OTEL Headers      ┌─────────────────────┐
│ Ark Query   │ ──────────────────►   │ claude-code-agent   │
│ Controller  │                       │                     │
└─────────────┘                       └─────────────────────┘
      │                                        │
      │ traces                                 │ traces (if enabled)
      ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     Ark Broker                               │
│                  (/v1/traces endpoint)                       │
└─────────────────────────────────────────────────────────────┘
```

Ark injects OTEL headers via `telemetry.InjectOTELHeaders()` in `a2a.go:188-192`.
claude-code-agent can export traces to the same endpoint with:
```yaml
env:
  CLAUDE_CODE_ENABLE_TELEMETRY: "1"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://ark-broker:3000"
```

## Multi-Agent / Customization

Multiple claude-code-agent instances with different configs:

```yaml
# Research agent with research tools
helm install claude-code-research oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --set agentName=claude-research \
  --set-file mcpConfig=research-mcp.json \
  --set-file skills=research-skills/

# Coding agent with coding tools
helm install claude-code-coding oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --set agentName=claude-coding \
  --set-file mcpConfig=coding-mcp.json \
  --set-file skills=coding-skills/
```

Each creates a separate A2AServer → separate Agent in Ark.

## Key Code Locations

| Component | File | Purpose |
|-----------|------|---------|
| A2A reserved engine | `ark/internal/genai/a2a_types.go:10` | `ExecutionEngineA2A = "a2a"` |
| A2A routing | `ark/internal/genai/agent.go:79` | Routes to A2A when engine is "a2a" |
| A2A execution | `ark/internal/genai/a2a_execution.go` | Sends JSON-RPC to A2A server |
| A2A protocol | `ark/internal/genai/a2a.go` | A2A client, discovery, OTEL injection |
| A2AServer controller | `ark/internal/controller/a2aserver_controller.go` | Auto-discovers and creates Agents |
| A2AServer CRD | `ark/api/v1prealpha1/a2aserver_types.go` | A2AServer spec definition |
