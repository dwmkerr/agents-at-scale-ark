---
owner: ark-protocol-orchestrator
description: Future work - broker upstream OTEL forwarding
---

# Finding: Upstream OTEL Forwarding

## Summary

ark-broker could optionally forward received OTLP spans to external OTEL backends (Langfuse, Phoenix, etc.).

## Context

During architecture design, we identified that the broker could act as a local aggregator while still feeding long-term observability platforms. This is out of scope for the current task.

## Potential Capabilities

- Forward to external OTEL backends after processing
- Support multiple upstreams
- Controller doesn't need to know about external backends

## Use Cases

- Broker aggregates for real-time dashboard, also sends to Langfuse for long-term analysis
- Multiple teams use different observability backends

## Next Steps

Create a separate task when this capability is needed.
