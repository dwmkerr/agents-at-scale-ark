# Resources

Installation resources for each prototype step.

## Prerequisites

- Ark installed in cluster
- `ANTHROPIC_API_KEY` environment variable set

## Step 1: Hello World

```bash
./step1-install.sh
```

Or manually:
```bash
helm install claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY
```

## Step 2: OTEL

```bash
kubectl apply -f otel-configmap.yaml
kubectl rollout restart deployment/claude-code-agent
```

## Step 3: MCP

```bash
kubectl apply -f mcp-config.yaml
helm upgrade claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY \
  --set mcpConfig.existingSecret=mcp-config
```

## Step 4: Skills

```bash
kubectl apply -f skills-config.yaml
helm upgrade claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY \
  --set skills.existingConfigMap=skills-config
```

## Uninstall

```bash
helm uninstall claude-code-agent
kubectl delete configmap otel-environment-variables skills-config 2>/dev/null || true
kubectl delete secret mcp-config 2>/dev/null || true
```
