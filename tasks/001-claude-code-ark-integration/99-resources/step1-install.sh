#!/bin/bash
set -e

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY not set"
  exit 1
fi

echo "=== Step 1: Install claude-code-agent ==="

helm install claude-code-agent oci://ghcr.io/dwmkerr/charts/claude-code-agent \
  --version ">=0.1.3" \
  --set apiKey=$ANTHROPIC_API_KEY

echo "=== Waiting for pod ==="
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=claude-code-agent --timeout=120s

echo "=== Verify A2AServer ==="
kubectl get a2aserver

echo "=== Verify Agent ==="
kubectl get agent

echo "=== Test query ==="
ark query agent/claude-code-agent "What is 2 + 2?"

echo "=== Step 1 complete ==="
