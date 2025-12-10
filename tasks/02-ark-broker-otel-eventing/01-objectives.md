---
owner: ark-protocol-orchestrator
description: Objectives for OTEL eventing in ark-broker
---

# Ark Broker OTEL Eventing - Objectives

## Overview

Add real-time execution visibility to Ark through OTEL-based eventing. The controller emits events for query lifecycle, LLM calls, and tool executions. Consumers (dashboard, CLI, API clients) receive a unified stream showing exactly what's happening during execution. Beyond OTEL events, specific and more complex types of data can also be handled, such as LLM completion chunks, A2A task updates, and so on, with the broker handling and aggregating where needed.

The goals of this task are initially focused on the OTEL events - later tasks will take on the LLM chunks and A2A task updates.

## Goals

1. **Controller as Primary Producer** - The Ark controller emits OTEL spans for all query lifecycle events, LLM requests, and tool calls
2. **Automatic A2A/MCP Capture** - Agent and tool interactions flow through the controller's instrumentation without requiring changes to MCP servers
3. **Real-time Consumer Streaming** - Dashboard, CLI, and API clients receive events as they happen via SSE
4. **Session Aggregation** - Events are correlated by trace ID into unified session views

## Use Cases

- Watch an agent's reasoning and tool calls in real-time from the dashboard
- Allow clients like the CLI, APIs and users to watch the stream of events in real time and provide information
- Correlate questions back to the query that triggered them
- Replay completed sessions to understand what happened
- Retain sufficient data to resume or restart queries
- Long term storage by allowing events that enter the broker to be written to external databases
- Scalability by allowing the broker to have its underlying event stream later externalised, for example to kafka

## Event Types

Example events emitted:

- Query start / end
- Tool call start / end
- Team call start / end

## Success Criteria

- Controller emits spans for query lifecycle transitions
- Controller emits spans for LLM calls with model and token metadata
- Controller emits spans for tool calls with input/output
- Events stream to consumers via SSE endpoint
- Events correlate by trace ID to their parent query
- Sessions aggregate related queries for UI display
- External OTEL backends (Langfuse, Jaeger) receive events when configured
