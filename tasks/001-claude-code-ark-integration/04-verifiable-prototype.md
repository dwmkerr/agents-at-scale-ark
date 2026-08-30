# Verifiable Prototype

Sequential verification steps for Claude Code A2A integration with Ark.

## Prerequisites

- Ark installed in cluster
- `ANTHROPIC_API_KEY` environment variable set
- `ark` or `fark` CLI available

## Step 1: Hello World

**Goal**: Deploy claude-code-agent and verify basic query execution.

```bash
# Install the chart with Anthropic key (requires v0.1.3+ for envFrom support)
helm install claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY

# Verify A2AServer and Agent created. Might take a couple of mins.
kubectl get a2aserver
kubectl get agent

# Query the agent
ark query agent/claude-code "What is 2 + 2?"
```

**Checkpoint 1:**
- [x] Helm install succeeds
- [x] A2AServer shows Ready
- [x] Agent CRD auto-created
- FAIL: Query returns correct response

Note: the failure is related to A2A message response accumulation. See [PR #579](https://github.com/mckinsey/agents-at-scale-ark/pull/579) for the fix.

## Step 2: OTEL Telemetry

**Goal**: Verify telemetry flows to configured backend.

Phoenix (or other OTEL backends) creates an `otel-environment-variables` secret that services can pick up via `envFrom`.

```bash
# Install Phoenix (creates otel-environment-variables secret in default namespace)
ark install marketplace/services/phoenix

# Verify OTEL secret exists
kubectl get secret otel-environment-variables

# Upgrade chart with envFrom to pick up OTEL config
helm upgrade claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version "0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY \
  --set env.CLAUDE_CODE_ENABLE_TELEMETRY=1 \
  --set env.OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
  --set envFrom[0].secretRef.name=otel-environment-variables \
  --set envFrom[0].secretRef.optional=true

# Verify agent has OTEL env vars
kubectl exec deployment/claude-code-agent -- env | grep -E "TEL|OTEL"
# eg:
# CLAUDE_CODE_ENABLE_TELEMETRY=1
# OTEL_EXPORTER_OTLP_ENDPOINT=http://phoenix-svc.phoenix.svc.cluster.local:6006
# OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# OTEL_EXPORTER_OTLP_HEADERS=

# Open Phoenix UI
kubectl port-forward -n phoenix svc/phoenix-svc 6006:6006

# Send a query to generate traces
ark query agent/claude-code "Tell me about observability"

# Check Phoenix UI at http://localhost:6006 for traces
```

**Checkpoint 2:**
- [x] OTEL secret exists in namespace
- [x] Agent has OTEL environment variables
- [ ] ~~Traces visible in Phoenix UI~~ - **BLOCKED** (see finding below)
- [ ] ~~Spans include Claude model calls~~ - **BLOCKED**

### Finding: Signal Type Mismatch

**Claude Code CLI exports OTEL metrics and logs, not traces.** Phoenix only accepts traces. They are incompatible without modification.

| Signal | Claude Code CLI | Phoenix |
|--------|-----------------|---------|
| Traces | ❌ Not exported | ✅ Required |
| Metrics | ✅ Exported | ❌ Not supported |
| Logs | ✅ Exported | ❌ Not supported |

**Next steps**: Add OpenTelemetry tracing instrumentation to the `claude-code-agent` wrapper itself. When an A2A request arrives, start a trace span; when it completes, end the span and export to Phoenix. See `99-resources/otel.md` for implementation details.

**Related PRs:**
- [claude-code-agent #16](https://github.com/dwmkerr/claude-code-agent/pull/16) - OTEL docs update
- [marketplace #89](https://github.com/mckinsey/agents-at-scale-marketplace/pull/89) - Phoenix OTEL protocol fix

## Step 3: MCP Servers

**Goal**: Configure MCP servers via Helm chart.

```bash
# Create MCP config
kubectl apply -f 99-resources/mcp-config.yaml

# Upgrade chart with MCP config reference
helm upgrade claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY \
  --set mcpConfig.existingSecret=mcp-config

# Restart pod
kubectl rollout restart deployment/claude-code-agent

# Verify MCP server loaded (check agent logs)
kubectl logs -l app.kubernetes.io/name=claude-code-agent | grep -i mcp

# Test MCP tool usage
ark query agent/claude-code-agent "Use the filesystem tool to list /tmp"
```

**Checkpoint 3:**
- [ ] MCP config mounted into container
- [ ] MCP server appears in agent logs at startup
- [ ] Agent can use MCP tools in queries

## Step 4: Skills Configuration

**Goal**: Configure Claude skills/agents via Helm chart.

```bash
# Create skills ConfigMap
kubectl apply -f 99-resources/skills-config.yaml

# Upgrade chart with skills mount
helm upgrade claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY \
  --set skills.existingConfigMap=skills-config

# Restart pod
kubectl rollout restart deployment/claude-code-agent

# Test skill invocation
ark query agent/claude-code-agent "Use the greeting skill to say hello"
```

**Checkpoint 4:**
- [ ] Skills mounted to `~/.claude/skills/`
- [ ] Skill appears in agent's available skills
- [ ] Skill can be invoked via query

## Verification Script

Quick verification for all steps:

```bash
#!/bin/bash
set -e

echo "=== Step 1: Hello World ==="
kubectl get pods -l app.kubernetes.io/name=claude-code-agent
kubectl get a2aserver
kubectl get agent
ark query agent/claude-code-agent "Say hello" | head -5

echo "=== Step 2: OTEL ==="
kubectl get configmap otel-environment-variables 2>/dev/null && echo "OTEL configured" || echo "No OTEL config"

echo "=== Step 3: MCP ==="
kubectl get secret mcp-config 2>/dev/null && echo "MCP configured" || echo "No MCP config"

echo "=== Step 4: Skills ==="
kubectl get configmap skills-config 2>/dev/null && echo "Skills configured" || echo "No skills config"

echo "=== Done ==="
```

## Resources

Installation resources are in `99-resources/`:
- `step1-install.sh` - Basic helm install
- `otel-configmap.yaml` - OTEL environment configuration
- `mcp-config.yaml` - MCP server configuration
- `skills-config.yaml` - Claude skills configuration

## Expected Outcome

After completing all steps:
1. Claude Code agent running in cluster
2. Queries execute via Ark API
3. OTEL traces flow to backend
4. MCP servers available for tool use
5. Skills configured and invocable
