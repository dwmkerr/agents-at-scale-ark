# Finding: OTEL Auto-Injection Pattern

## Summary

Ark uses a standardized ConfigMap/Secret pattern for OTEL configuration. Services that include `envFrom` references to `otel-environment-variables` automatically pick up OTEL settings.

## Current State

| Component | Has Pattern? | Location |
|-----------|--------------|----------|
| ark-controller | ✅ Yes | `ark/dist/chart/templates/manager/manager.yaml:54-60` |
| claude-code-agent | ❌ No | `chart/templates/deployment.yaml` |

## Required Change

Add `envFrom` to `claude-code-agent/chart/templates/deployment.yaml` after the `env` block (around line 52):

```yaml
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  # ... existing config
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          # ADD THIS BLOCK:
          envFrom:
          - configMapRef:
              name: otel-environment-variables
              optional: true
          - secretRef:
              name: otel-environment-variables
              optional: true
```

## How It Works

1. **If ConfigMap/Secret exists** → OTEL env vars injected automatically
2. **If not** → Deployment works without OTEL (optional: true)
3. **No Helm values needed** → Auto-discovery from namespace

## Example ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-environment-variables
  namespace: default  # Same namespace as claude-code-agent
data:
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://phoenix-svc.phoenix:4317"
  OTEL_EXPORTER_OTLP_PROTOCOL: "grpc"
  CLAUDE_CODE_ENABLE_TELEMETRY: "1"
  OTEL_SERVICE_NAME: "claude-code-agent"
```

## Example Secret (for auth headers)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: otel-environment-variables
  namespace: default
type: Opaque
stringData:
  OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer <token>"
```

## Benefits

1. **Consistent with Ark** - Same pattern as ark-controller
2. **Zero config** - Works automatically if OTEL is configured in namespace
3. **Flexible** - Works with any OTEL backend (Phoenix, Langfuse, Jaeger, etc.)
4. **Secure** - Sensitive headers can go in Secret

## Documentation Reference

From `docs/content/developer-guide/observability/index.mdx`:

> One way to set up automatic OpenTelemetry configuration is through standardized ConfigMap and Secret references. This pattern allows any Kubernetes resource to automatically pick up OTEL environment variables when available.

## Action Items

- [x] Update claude-code-agent chart with `envFrom` pattern
- [ ] Document in chart README
- [ ] Release new chart version
