---
owner: ark-protocol-orchestrator
description: Architecture for OTEL eventing in ark-broker
---

# Ark Broker OTEL Eventing Architecture

## Overview

The Ark controller emits OTEL spans for query lifecycle events. The controller's telemetry layer **forks** spans to two destinations:
1. **External OTEL backend** (Langfuse, Phoenix, etc.) - existing flow, unchanged
2. **ark-broker** - HTTP/JSON OTLP endpoint for real-time visibility

ark-broker receives spans via standard OTLP HTTP (no gRPC), aggregates them by session, and streams to consumers via SSE. This extends ark-cluster-memory with OTEL ingestion while keeping external observability independent.

### Protocol Decision

**HTTP/JSON only** - ark-broker implements `POST /v1/traces` accepting OTLP JSON format. No gRPC support needed because:
- HTTP/JSON is simpler to implement in TypeScript/Express
- Go OTEL SDK supports HTTP export via `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`
- We use types from `@opentelemetry/otlp-transformer` for parsing
- gRPC can be added later via OTEL Collector sidecar if needed

## Component Diagram

```
                                      Ark Platform
+------------------------------------------------------------------------------------------------------+
|                                                                                                      |
|  PRODUCERS                                  ARK-BROKER                        CONSUMERS              |
|                                                                                                      |
|  +------------------+                  +---------------------------+      +------------------+       |
|  |  Query           |   OTLP/HTTP      |                           | SSE  |  Dashboard       |       |
|  |  Controller      +------+---------->|   +=========+   +=====+   +----->|  (Sessions UI)   |       |
|  +------------------+      |           |   | Session |   | PVC |   |      +------------------+       |
|                            |           |   | Store   +-->|     |   |                                 |
|                            |           |   |         |   +=====+   |      +------------------+       |
|                            |           |   +=========+             | SSE  |  CLI (ark)       |       |
|                            |           |                           +----->|                  |       |
|                            |           |   APIs:                   |      +------------------+       |
|                            |           |   - POST /v1/traces       |                                 |
|                            |           |   - GET  /events          |      +------------------+       |
|                            |           |   - GET  /sessions        | REST |  API Clients     |       |
|                            |           |   - GET  /sessions/:id    +----->|                  |       |
|                            |           |                           |      +------------------+       |
|                            |           +---------------------------+                                 |
|                            |                                                                         |
|                            | OTLP/HTTP or gRPC (independent)                                         |
|                            v                                                                         |
|              +---------------------------+                                                           |
|              |  External OTEL Backend    |                                                           |
|              |  (Langfuse, Phoenix, etc.)|                                                           |
|              +---------------------------+                                                           |
|                                                                                                      |
+------------------------------------------------------------------------------------------------------+

Controller Telemetry Forking:
- Controller OTEL SDK configured with TWO exporters
- Exporter 1: ark-broker (HTTP/JSON) for real-time visibility
- Exporter 2: External backend (HTTP or gRPC) for long-term observability
- Both paths are independent - broker down doesn't affect external OTEL
```

## Data Model

### OTEL Span (Ingested Format)

The controller emits standard OTEL spans. ark-broker receives them via OTLP HTTP/JSON (standard format, parsed using `@opentelemetry/otlp-transformer` types):

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "ark-controller"}}
      ]
    },
    "scopeSpans": [{
      "scope": {"name": "ark/controller"},
      "spans": [{
        "traceId": "abc123def456...",
        "spanId": "span-001",
        "parentSpanId": "",
        "name": "query.my-query",
        "kind": 1,
        "startTimeUnixNano": "1705312200000000000",
        "endTimeUnixNano": "1705312201200000000",
        "attributes": [
          {"key": "query.name", "value": {"stringValue": "my-query"}},
          {"key": "query.namespace", "value": {"stringValue": "default"}},
          {"key": "session.id", "value": {"stringValue": "session-abc"}},
          {"key": "query.phase", "value": {"stringValue": "execute"}}
        ],
        "status": {"code": 1}
      }]
    }]
  }]
}
```

### Storage Format Decision

**Decision: Store and stream raw OTLP JSON as-is.** No internal normalization.

Rationale:
- Single format - no transformation logic to maintain
- OTLP is a standard - documented, external consumers know it
- Consumers add a trivial helper to parse attributes if needed
- `/sessions` endpoint can normalize for ergonomics later if needed
- Aggregation indexes key fields (session.id, trace.id) on ingest without transforming storage

### API Views Principle

**Different endpoints provide different views of the same underlying OTLP data:**

| Endpoint | Format | Purpose |
|----------|--------|---------|
| `GET /traces` | All traces, raw OTLP | Full visibility, debugging, system events |
| `GET /traces?watch=true` | SSE stream of all spans | Real-time trace streaming |
| `GET /sessions` | Traces with `session.id`, grouped | User session tracking |
| `GET /sessions?watch=true` | SSE stream of session spans | Real-time session updates |
| `GET /sessions/:id` | Single session's traces/queries | Session detail view |
| `GET /sessions/:id?watch=true` | SSE stream for one session | Real-time single session |

No "broker internal format" - just views that transform as needed for their purpose.

**Key distinction:**
- `/traces` returns ALL ingested OTLP data (including system events like `controller.startup`)
- `/sessions` returns only traces that have a `session.id` attribute (user queries)

### Session View (for `/sessions/:id`)

Light aggregation - grouped by session and query, but spans inside are raw OTLP:

```json
{
  "id": "session-abc",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z",
  "queries": {
    "my-query": {
      "traceId": "abc123def456",
      "spans": [
        { /* raw OTLP span */ },
        { /* raw OTLP span */ }
      ]
    }
  }
}
```

The grouping uses indexes built on ingest (session.id, query.name attributes). Spans themselves are untransformed.

## API Design

### API Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/traces` | POST | OTLP receiver - ingest spans |
| `/traces` | GET | List all traces (raw OTLP) |
| `/traces?watch=true` | GET | SSE stream of all incoming spans |
| `/sessions` | GET | List sessions (traces with `session.id`) |
| `/sessions?watch=true` | GET | SSE stream of session-related spans |
| `/sessions/:id` | GET | Get single session with queries/spans |
| `/sessions/:id?watch=true` | GET | SSE stream for one session |
| `/sessions` | DELETE | Purge all sessions and traces |

### OTEL Receiver

**POST /v1/traces** - Receive OTLP spans

Standard OTLP HTTP endpoint. Accepts JSON encoding.

Request:
```json
{
  "resourceSpans": [...]
}
```

Response:
```json
{
  "partialSuccess": {}
}
```

### Traces API (REST + Watch)

**GET /traces** - List all traces or watch for new spans

Returns all ingested OTLP traces regardless of session context. System events like `controller.startup` appear here.

Query parameters:
- `limit` - Maximum traces to return (default 100)
- `cursor` - Pagination cursor (traceId)
- `since` - Filter by start time (ISO timestamp)
- `watch` - If `true`, stream new spans via SSE
- `resourceVersion` - When watching, only stream changes after this version

List response:
```json
{
  "resourceVersion": "156",
  "traces": [
    {
      "traceId": "abc123def456",
      "spans": [/* raw OTLP spans */],
      "startTime": "2024-01-15T10:30:00.000Z"
    }
  ],
  "cursor": "next-trace-id"
}
```

Watch response (SSE):
```
event: span
data: { /* raw OTLP span */ }
```

### Sessions API (REST + Watch)

Following the Kubernetes-style watch pattern from `tasks/01-ark-broker-and-questions/02-architecture.md`:

**GET /sessions** - List sessions or watch for changes

Query parameters:
- `limit` - Maximum sessions to return (default 100)
- `before` - Cursor for pagination
- `active` - Filter to only active sessions
- `watch` - If `true`, stream changes via SSE instead of returning list
- `resourceVersion` - When watching, only stream changes after this version

List response:
```json
{
  "resourceVersion": "42",
  "sessions": [
    {
      "id": "session-abc",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z",
      "queryCount": 3,
      "activeQueries": 1
    }
  ],
  "cursor": "session-xyz"
}
```

Watch response (SSE):
```
event: span
data: { /* raw OTLP span */ }

event: span
data: { /* raw OTLP span */ }
```

**GET /sessions/:id** - Get session or watch its events

Query parameters:
- `watch` - If `true`, stream this session's events via SSE
- `resourceVersion` - When watching, only stream changes after this version

Get response:
```json
{
  "resourceVersion": "15",
  "id": "session-abc",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:35:00.000Z",
  "queries": {
    "my-query": {
      "traceId": "abc123def456",
      "spans": [/* raw OTLP spans */]
    }
  }
}
```

Watch response (SSE):
```
event: span
data: { /* raw OTLP span for this session */ }
```

### Watch Pattern

Same pattern as questions API (see `tasks/01-ark-broker-and-questions/02-architecture.md#addendum-watch-pattern-with-resourceversion`):

1. **List returns resourceVersion** - Monotonic counter incremented on each change
2. **Watch accepts resourceVersion** - Only streams changes after that version
3. **Dashboard flow** - Initial fetch gets data + resourceVersion, then watch uses that resourceVersion
4. **Benefit** - Clients receive only new events, not replayed history

Example:
```bash
# Initial fetch
curl http://ark-broker:8082/sessions
# Response: { "resourceVersion": "42", "sessions": [...] }

# Watch from that point
curl -N "http://ark-broker:8082/sessions?watch=true&resourceVersion=42"
# Streams only new spans as SSE
```

## Controller Instrumentation

The controller already has a telemetry abstraction layer. We extend the exporter to **fork** spans to ark-broker when configured.

### Current Flow

```
Controller -> Telemetry Provider -> Span Processor -> OTLP Exporter -> External Backend
```

### Extended Flow (Forking Exporter)

```
Controller -> Telemetry Provider -> Span Processor -> Forking Exporter -> External Backend
                                                                       |
                                                                       +-> ark-broker (if configured)
```

The fork is an **implementation detail** inside the exporter:
- Most code doesn't know or care about the fork
- Just one span processor, one exporter interface
- Forking exporter sends to both destinations
- If `ARK_BROKER_OTLP_ENDPOINT` not set, no fork - behaves exactly as before

### Configuration

```yaml
env:
  # Existing: External observability
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "https://langfuse.example.com:4317"

  # New: Enable fork to ark-broker (optional)
  - name: ARK_BROKER_OTLP_ENDPOINT
    value: "http://ark-cluster-memory:4318"
```

When `ARK_BROKER_OTLP_ENDPOINT` is set, the exporter sends to both. When not set, behavior is unchanged.

### Span Types Emitted

The controller already emits these spans via the existing telemetry abstraction:

| Span Name | Type | Attributes |
|-----------|------|------------|
| `query.<name>` | Query lifecycle | `query.name`, `query.namespace`, `session.id`, `query.phase` |
| `target.<name>` | Target execution | `target.type`, `target.name` |
| `agent.<name>` | Agent execution | `agent.name`, `agent.namespace` |
| `model.<name>` | LLM call | `llm.model.name`, `llm.model.provider`, input/output tokens |
| `tool.<name>` | Tool execution | `tool.name`, `tool.type`, `tool.input`, `tool.output` |
| `team.<name>` | Team execution | `team.name`, `team.strategy`, `team.members` |

### Event Type Derivation

The broker derives event types from span names:

| Span Name Pattern | Derived Event Type |
|-------------------|-------------------|
| `query.*` | `query.started`, `query.completed`, `query.error` |
| `model.*` | `llm.request`, `llm.response` |
| `tool.*` | `tool.call`, `tool.result` |
| `team.*` | `team.started`, `team.completed` |
| `agent.*` | `agent.started`, `agent.completed` |

## Session Aggregation

### Correlation Strategy

Sessions are identified by the `session.id` attribute on query spans:

1. **Session ID is always present** - Controller generates one if not provided in `spec.sessionId`, stored in query status
2. All child spans inherit the trace context (trace ID propagation)
3. ark-broker extracts `session.id` from the root query span
4. Child spans are correlated to sessions via their trace ID

### Aggregation Rules

1. **New session**: Created when a span with `session.id` arrives for an unknown session
2. **Query association**: Spans with `query.name` attribute create/update query entries in the session
3. **Event ordering**: Events are ordered by `startTimeUnixNano`
4. **Span completion**: When a span ends, the event is updated with duration and status
5. **Session lifecycle**: Sessions remain active while any query is running; inactive after a configurable timeout

### Storage

Keep it simple - same pattern as existing cluster-memory:

**Data Model:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Traces Store   │     │ Sessions Store  │     │  Session Index  │
│  (all spans)    │     │ (registry)      │     │ (in-memory)     │
│                 │     │                 │     │                 │
│ traceId → spans │     │ sessionId → {}  │     │ sessionId →     │
│                 │     │                 │     │   [traceIds]    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Traces** (`traces.json`) - All OTLP spans indexed by traceId. This is the primary store.
2. **Sessions** (`sessions.json`) - Registry of sessions that exist. Created when a span with `session.id` arrives.
3. **Session Index** (in-memory) - Maps sessionId → traceIds for fast `/sessions` queries.

**On span arrival:**
1. Always store in traces by traceId
2. If span has `session.id`: ensure session exists in registry, add traceId to session index

**Persistence:**
1. **In-memory** - All traces and sessions held in memory for fast access
2. **Flush to disk** - Periodic flush to JSON files
3. **PVC backing** - Disk is typically a PVC in Kubernetes

This can be swapped for a database later if needed. Start simple.

### External Storage (Future)

The storage layer is abstracted to support future backends:

- PostgreSQL for durable event storage
- Redis for distributed session state
- Kafka for high-volume event streaming

## Upstream Forwarding (Future)

**Out of scope for this task.** See `99-findings/01-upstream-forwarding.md` for follow-on work.

The broker could optionally forward spans to external OTEL backends, enabling:
- ark-broker handles real-time streaming to dashboard/CLI
- External backends handle long-term storage and analysis
- Support for multiple upstream endpoints

## Key Decisions

| Decision | Resolution |
|----------|------------|
| OTLP vs custom receiver? | **OTLP HTTP/JSON** - standard format, leverage existing libraries |
| Session ID source? | **Always present** - controller generates if not in spec, stored in status |
| Event retention? | **30 days on PVC** - memory is cache, PVC is durable, DB later |
| Span buffering? | **Process immediately** - real-time streaming requires no batching |

## Example: Question-Query Correlation

This example shows how rich telemetry enables complex operations like correlating questions to queries via MCP.

**Flow:**
1. Query executes, controller emits spans with `session.id` and `query.name`
2. Agent calls MCP tool `ask_question` - controller includes `mcp.session.id` in span
3. Question is created in broker via MCP, linked to `mcp.session.id`
4. Questions reconciler watches for answers
5. When answered, reconciler uses `mcp.session.id` to find the originating query
6. Query phase updated to continue execution

**Key insight**: The controller knows the MCP session ID at call time, includes it in telemetry. This correlation data flows through the broker, enabling downstream services to link back to queries.
