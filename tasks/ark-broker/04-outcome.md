---
owner: ark prototyper agent
description: Prototype outcome and architectural decision for ark-broker
---

# Ark Broker Prototype Outcome

## What We Learned

The prototype validated the core mechanics: agents can ask questions via MCP, users can answer via Dashboard/REST, and queries complete with the answer. However, the "waiting" phase revealed a fundamental challenge:

**The correlation problem**: When ark-broker's `ask_question` tool is called, how does it know which Query it's serving? The MCP connection comes from the executor, not the Query controller.

This led to a broader realization: ark-broker needs to understand the full context of query execution. Tool calls, LLM chunks, state transitions, and MCP sessions all need to flow through a central point for proper correlation and visibility.

## Architectural Decision: OTEL as Lingua Franca

We adopt OpenTelemetry (OTEL) as the canonical format for all execution events:

1. **Industry-standard correlation** - Trace IDs and span IDs handle parent-child relationships
2. **Existing tooling** - Langfuse, Jaeger, and other backends work out of the box
3. **Extensibility** - Any producer can emit OTEL, any consumer can process it
4. **Works without broker** - External OTEL backends function independently

## Architecture

```
                                      Ark Platform
+------------------------------------------------------------------------------------------------------+
|                                                                                                      |
|  PRODUCERS                              ARK-BROKER                            CONSUMERS              |
|  ─────────                              ──────────                            ─────────              |
|                                                                                                      |
|  +------------------+              +---------------------------+           +------------------+       |
|  |  Query           |              |                           |           |  Dashboard       |       |
|  |  Controller      +------------->|   +=========+   +=====+   +---------->|  (Sessions UI)   |       |
|  +------------------+              |   |  Event  |   | DB  |   |           +------------------+       |
|                        OTEL spans  |   |  Queue  |   | | | |   |                                      |
|  +------------------+  & LLM chunks|   |   ( )   +-->| | | |   |           +------------------+       |
|  |  Executor        +------------->|   |   ( )   |   +=====+   +---------->|  CLI             |       |
|  |  (LangChain)     |              |   |   ( )   |             |           |  (fark/ark)      |       |
|  +------------------+              |   +=========+             |           +------------------+       |
|                                    |                           |                                      |
|  +------------------+              |   Reconcilers (future):   |           +------------------+       |
|  |  MCP Servers     +------------->|   - Query processing      +---------->|  API Clients     |       |
|  |  (tools)         |              |   - Event triggers        |           |  (v1/completions)|       |
|  +------------------+              |   - Notifications         |           +------------------+       |
|                                    |                           |                                      |
|  +------------------+              +-------------+-------------+                                      |
|  |  A2A Servers     +------------->              |                                                    |
|  |  (agents)        |                            v                                                    |
|  +------------------+              +-------------+-------------+                                      |
|                                    |  Upstream OTEL (optional) |                                      |
|  +------------------+              |  (Langfuse, Jaeger, etc.) |                                      |
|  |  Custom          +------------->+---------------------------+                                      |
|  |  Producers       |      OR                                                                         |
|  +------------------+      |                                                                          |
|         |                  |                                                                          |
|         +------------------+-------> External OTEL (works without broker)                            |
|                                                                                                      |
+------------------------------------------------------------------------------------------------------+
```

**Key insight**: ark-broker is optional. Producers can send OTEL directly to external backends. The broker adds correlation, aggregation, and real-time streaming for consumers. Internal queue/DB are implementation details - can be offloaded to Kafka/RDS.

## What Flows Through ark-broker

- **OTEL spans** - Query lifecycle, tool calls, state transitions
- **LLM completion chunks** - Streaming tokens from the model
- **A2A task updates** - Agent-to-agent coordination events
- **Custom events** - Team handoffs, approvals, etc.

## Data Model

### Event Stream (OTEL-structured)

Events flow as OTEL spans with trace correlation:

```json
{"traceId":"abc123","spanId":"span-001","name":"query.started","attributes":{"query.name":"query-001","session.id":"session-abc"}}
{"traceId":"abc123","spanId":"span-002","parentSpanId":"span-001","name":"llm.request","attributes":{"model":"gpt-4"}}
{"traceId":"abc123","spanId":"span-003","parentSpanId":"span-001","name":"tool.call","attributes":{"tool.name":"web_search","tool.input":"weather NYC"}}
{"traceId":"abc123","spanId":"span-003","name":"tool.result","attributes":{"tool.output":"72F sunny"}}
{"traceId":"abc123","spanId":"span-004","parentSpanId":"span-001","name":"tool.call","attributes":{"tool.name":"ask_question","mcp.session.id":"mcp-xyz"}}
{"traceId":"abc123","spanId":"span-001","name":"query.waiting","attributes":{"question.uri":"ark://questions/q-123"}}
{"traceId":"abc123","spanId":"span-001","name":"query.completed","attributes":{"duration.ms":1200}}
```

### Session Structure (aggregated view)

The broker aggregates events into a denormalized session structure:

```json
{
  "id": "session-abc",
  "queries": {
    "query-001": {
      "phase": "done",
      "traceId": "abc123",
      "mcpSessions": {"ark-broker": "mcp-xyz"},
      "streamId": "stream-001",
      "events": [
        {"type": "query.started", "ts": "2024-01-15T10:30:00Z"},
        {"type": "tool.call", "tool": "web_search", "input": "weather NYC", "output": "72F sunny"},
        {"type": "query.completed", "duration": 1200}
      ]
    }
  }
}
```

### SSE Stream (v1/completions consumer view)

Custom events interleave with completion chunks:

```
data: {"type":"event","event":{"type":"query.started","queryName":"q1"}}

data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" world"}}]}

data: {"type":"event","event":{"type":"tool.called","tool":"ask_question"}}

data: {"type":"event","event":{"type":"query.waiting","questionUri":"ark://questions/123"}}

... (stream pauses, waiting for answer) ...

data: {"type":"event","event":{"type":"question.answered"}}

data: {"choices":[{"delta":{"content":"Approved!"}}]}

data: {"choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

## Sessions UI

```
Sessions
+-- session-abc-123 (active)
|   +-- query-001 (done)
|   |   +-- [event] query.started
|   |   +-- [stream] LLM chunks (52 tokens) > click to replay
|   |   +-- [tool] web_search("weather NYC") -> "72F sunny"
|   |   +-- [event] query.completed (1.2s)
|   |
|   +-- query-002 (waiting)
|   |   +-- [event] query.started
|   |   +-- [stream] LLM chunks (23 tokens) > click to replay
|   |   +-- [tool] ask_question -> "Approve production deploy?"
|   |   +-- [question] Waiting for response...
|   |   +-- [a2a] task-xyz (pending)
|   |
|   +-- query-003 (running)
|       +-- [event] query.started
|       +-- [stream] LLM streaming...
```

## What This Enables

- **Conversation memory** - Sessions aggregate all context across queries
- **MCP/A2A correlation** - Trace IDs link tool calls, tasks, and queries
- **Real-time visibility** - One stream delivers everything to consumers
- **Extensibility** - Anyone can produce or consume events
- **Works without broker** - External OTEL backends function independently

## Next Steps

1. **Define ark-broker OTEL receiver** - HTTP endpoint that accepts OTEL spans and stores in memory/PVC

2. **Instrument controller** - Emit OTEL spans for query lifecycle (started, waiting, done)

3. **Instrument executor** - Emit spans for LLM calls and tool executions

4. **Build session aggregation** - Correlate spans by trace ID into session views

5. **SSE streaming endpoint** - Serve aggregated events to dashboard and CLI

6. **Implement waiting phase** - Update Query phase based on MCP task events with proper correlation

## Future Improvements

- **Reconcilers** - ark-broker could run reconcilers that react to events:
  - Query processing (offload from K8s controller)
  - Event-driven triggers (e.g., auto-escalate unanswered questions)
  - Notification dispatch (Slack, email, webhooks)

- **Offload infrastructure** - Queue and DB are abstracted, can be replaced:
  - Event queue -> Kafka, Redis Streams, SQS
  - Database -> PostgreSQL, RDS, DynamoDB

- **Query execution in broker** - Eventually the broker could handle query execution itself, removing the need for K8s CRDs for simple queries while keeping CRDs for declarative/GitOps workflows
