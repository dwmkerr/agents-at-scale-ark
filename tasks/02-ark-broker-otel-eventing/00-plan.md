---
owner: ark-protocol-orchestrator
description: Plan for OTEL eventing in ark-broker
---

# Ark Broker OTEL Eventing - Plan

## Tasks

- [x] Define objectives
- [ ] Design architecture -> ark-architect
- [ ] Build verifiable prototype -> ark-prototyper
- [ ] Document outcome

## Findings

Discoveries tracked in `99-findings/`:

(none yet)

## Context

This task continues from `tasks/01-ark-broker-and-questions/` which validated question mechanics but revealed a visibility gap. The outcome document (`04-outcome.md`) established OTEL as the lingua franca for execution events.

Key decisions from previous task:
- OTEL spans provide industry-standard correlation
- ark-broker aggregates events into session views
- Consumers receive unified streams via SSE
- External backends (Langfuse, Jaeger) work independently
