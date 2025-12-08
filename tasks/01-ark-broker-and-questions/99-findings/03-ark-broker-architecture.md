# Ark Broker as Central Orchestration Service

## Summary

This finding proposes positioning ark-broker (currently implemented in ark-cluster-memory) as the central orchestration service that brokers all transitional state in Ark query execution. Rather than being a simple storage layer, the broker becomes the authoritative source for real-time query visibility - aggregating LLM chunks, tool calls, questions, and state transitions into a unified stream that enables dashboards, API consumers, and the controller to have complete visibility into query execution.

## The Core Problem

Today, visibility into query execution is fragmented:

1. **LLM response chunks** flow through the streaming endpoint but contain only text deltas
2. **Tool calls** are executed but not visible in the stream - the dashboard cannot see what tools the agent is calling
3. **Questions** (human-in-the-loop) are stored separately and require polling
4. **Query state** (running, waiting, done) is only visible via Kubernetes API
5. **Memory** stores the final conversation but not the real-time execution flow

This fragmentation means the dashboard and API consumers cannot show what an agent is actually doing - they only see text output, missing the rich context of tool execution and decision-making.

## Proposed Solution: Unified Execution Stream

The ark-broker becomes the **single source of truth for query execution state**, receiving and routing all transitional data:

```
+-------------------+     +-------------------+     +-------------------+
|   Controller      |     |   MCP Servers     |     |   Human Users     |
|   (Go operator)   |     |   (Tools)         |     |   (Dashboard/API) |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                         |
         | LLM chunks              | Tool results            | Question answers
         | Tool call requests      |                         |
         | State transitions       |                         |
         |                         |                         |
         v                         v                         v
+------------------------------------------------------------------------+
|                         ARK BROKER                                      |
|                   (Central Orchestration Service)                       |
|                                                                         |
|  +-------------------+  +-------------------+  +-------------------+    |
|  | Execution Stream  |  | Question Store   |  | State Manager    |    |
|  | (unified events)  |  | (pending/done)   |  | (phase tracking) |    |
|  +-------------------+  +-------------------+  +-------------------+    |
|                                                                         |
|  Events Include:                                                        |
|  - text_delta: LLM text chunks                                          |
|  - tool_call_start: agent requests tool                                 |
|  - tool_call_result: tool returns result                                |
|  - question_raised: ask_question called                                 |
|  - question_answered: human responds                                    |
|  - phase_change: query state transition                                 |
+------------------------------------------------------------------------+
         |                         |                         |
         | SSE stream              | SSE stream              | REST API
         v                         v                         v
+--------+----------+     +--------+----------+     +--------+----------+
|   Dashboard       |     |   API Consumers   |     |   Controller      |
|   (real-time UI)  |     |   (integrations)  |     |   (for resume)    |
+-------------------+     +-------------------+     +-------------------+
```

## Data Flow Architecture

### Inputs to the Broker

The broker receives data from multiple sources:

```
CONTROLLER -> BROKER
================================
1. LLM Streaming Chunks
   POST /stream/{query_id}
   - Already implemented
   - OpenAI-format chunks with text deltas

2. Tool Call Requests (NEW)
   Event injected when LLM returns tool_calls
   - tool_call_id from LLM
   - tool name, arguments
   - timestamp

3. Tool Call Results (NEW)
   Event injected when tool returns
   - tool_call_id (correlates with request)
   - result content
   - duration
   - success/error status

4. State Transitions (NEW)
   Event injected on phase changes
   - previous phase
   - new phase
   - reason (e.g., "waiting for question q-123")

MCP SERVERS -> BROKER
================================
5. Question Raised
   ask_question tool called
   - Already implemented via MCP
   - Creates pending question
   - Returns task ID

USERS -> BROKER
================================
6. Question Answered
   PATCH /questions/{id}
   - Already implemented
   - Updates question status
   - Triggers resume flow
```

### Outputs from the Broker

The broker routes aggregated data to consumers:

```
BROKER -> DASHBOARD
================================
SSE: GET /stream/{query_id}?unified=true

Event stream includes ALL event types:
- text_delta: {"content": "Let me search..."}
- tool_call_start: {"id": "call_123", "name": "web_search", "args": {...}}
- tool_call_result: {"id": "call_123", "result": "...", "duration_ms": 1234}
- question_raised: {"id": "q-abc", "content": "Should I proceed?"}
- question_answered: {"id": "q-abc", "response": "Yes"}
- phase_change: {"from": "running", "to": "waiting"}

BROKER -> API CONSUMERS
================================
Same SSE stream format for programmatic consumers

BROKER -> CONTROLLER (for resume)
================================
GET /queries/{query_id}/state

Returns:
{
  "phase": "waiting",
  "waitingFor": {
    "taskId": "q-abc123",
    "toolCallId": "call_xyz",
    "since": "2024-01-15T10:30:00Z"
  },
  "pendingToolCalls": [...],
  "resumeReady": true
}
```

## Extended Stream Event Format

The current streaming format only supports OpenAI-compatible chunks. To enable full visibility, we extend the format with typed events:

### Current Format (OpenAI chunks only)

```json
{"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}
```

### Extended Format (Unified Events)

```json
{
  "event": "text_delta",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "query": "my-query",
  "data": {
    "content": "Let me search for that information..."
  }
}
```

```json
{
  "event": "tool_call_start",
  "timestamp": "2024-01-15T10:30:01.456Z",
  "query": "my-query",
  "data": {
    "tool_call_id": "call_abc123",
    "tool_name": "web_search",
    "arguments": {"query": "kubernetes operators"}
  }
}
```

```json
{
  "event": "tool_call_result",
  "timestamp": "2024-01-15T10:30:03.789Z",
  "query": "my-query",
  "data": {
    "tool_call_id": "call_abc123",
    "success": true,
    "result": "Found 15 results...",
    "duration_ms": 2333
  }
}
```

```json
{
  "event": "question_raised",
  "timestamp": "2024-01-15T10:30:05.000Z",
  "query": "my-query",
  "data": {
    "question_id": "q-xyz789",
    "task_id": "q-xyz789",
    "tool_call_id": "call_def456",
    "recipient": "ark://users/dave",
    "content": "Should I proceed with the deployment?"
  }
}
```

```json
{
  "event": "phase_change",
  "timestamp": "2024-01-15T10:30:05.100Z",
  "query": "my-query",
  "data": {
    "from": "running",
    "to": "waiting",
    "reason": "question_pending",
    "question_id": "q-xyz789"
  }
}
```

### Backward Compatibility

The extended format is additive. Existing consumers can:
1. Use `?format=openai` to receive only OpenAI-compatible chunks (current behavior)
2. Use `?format=unified` (or `?unified=true`) to receive all event types

The `event` field distinguishes event types. Events without this field are treated as legacy OpenAI chunks.

## State Aggregation for Resume

The broker aggregates state to enable query resumption:

```
+------------------+
|  Query State     |
|  Aggregator      |
+------------------+
        |
        v
+------------------+     +------------------+
| Pending Tool     |     | Active Questions |
| Calls            |     | (from MCP Tasks) |
| - tool_call_id   |     | - task_id        |
| - tool_name      |     | - question_id    |
| - status         |     | - status         |
+------------------+     +------------------+
        |                        |
        v                        v
+----------------------------------------+
|          Resume State                  |
| {                                      |
|   "canResume": true,                   |
|   "phase": "waiting",                  |
|   "blockedOn": {                       |
|     "type": "question",                |
|     "taskId": "q-abc",                 |
|     "toolCallId": "call_xyz"           |
|   },                                   |
|   "conversationCheckpoint": {          |
|     "lastMessageIndex": 15,            |
|     "pendingToolCall": {...}           |
|   }                                    |
| }                                      |
+----------------------------------------+
```

## How This Enables Key Use Cases

### 1. Dashboard Real-Time Tool Visibility

**Before**: Dashboard shows only LLM text output. User has no visibility into what tools are being called.

**After**: Dashboard subscribes to unified stream and renders:
- Tool call badges as they happen
- Tool execution duration
- Success/failure status
- Collapsible result content

```
Query: "Search for kubernetes operators and summarize"
+------------------------------------------------------------+
| [RUNNING] Agent: code-assistant                            |
+------------------------------------------------------------+
| Let me search for information about kubernetes operators.  |
|                                                            |
| [tool] web_search("kubernetes operators") - 2.3s - SUCCESS |
| > Found 15 results including official docs...              |
|                                                            |
| Based on my search, kubernetes operators are...            |
+------------------------------------------------------------+
```

### 2. Dashboard Question Handling

**Before**: Questions require separate polling or page refresh.

**After**: Question events appear in the same stream:

```
+------------------------------------------------------------+
| [WAITING] Agent: deployment-assistant                      |
+------------------------------------------------------------+
| I've prepared the deployment. Before proceeding...         |
|                                                            |
| [question] Should I proceed with the deployment to prod?   |
| +------------------------------------------------------+   |
| |  [Yes, proceed]  [No, cancel]  [Let me think...]     |   |
| +------------------------------------------------------+   |
+------------------------------------------------------------+
```

### 3. Controller Resume Logic

**Before**: If controller restarts while waiting for a question, the query is orphaned.

**After**: Controller queries broker for resume state on startup:

```go
// On controller startup or reconcile
state, err := broker.GetQueryState(ctx, queryName)
if err != nil {
    return err
}

if state.Phase == "waiting" && state.CanResume {
    // Check if the blocking task is now complete
    if state.BlockedOn.Type == "question" {
        taskResult, err := mcpClient.GetTaskResult(state.BlockedOn.TaskID)
        if taskResult.Status == "completed" {
            // Reconstruct and resume
            messages := memory.GetMessages(queryName)
            messages = append(messages, ToolResultMessage{
                ToolCallID: state.BlockedOn.ToolCallID,
                Content:    taskResult.Result,
            })
            // Continue LLM execution
            return agent.Execute(ctx, messages)
        }
    }
}
```

### 4. API Consumer Integration

External systems can subscribe to query execution for automation:

```bash
# Monitor query execution
curl -N "http://ark-broker/stream/my-query?unified=true" | while read line; do
  event=$(echo "$line" | jq -r '.event')
  case "$event" in
    "question_raised")
      # Auto-answer based on policy
      question_id=$(echo "$line" | jq -r '.data.question_id')
      curl -X PATCH "http://ark-broker/questions/$question_id" \
        -d '{"response": "approved by automation"}'
      ;;
    "phase_change")
      # Notify external system
      phase=$(echo "$line" | jq -r '.data.to')
      notify_slack "Query phase changed to: $phase"
      ;;
  esac
done
```

## Implementation Phases

### Phase 1: Tool Call Event Injection

Extend controller streaming to inject tool call events:

1. When LLM returns `tool_calls`, inject `tool_call_start` event to stream
2. When tool execution completes, inject `tool_call_result` event
3. Update dashboard to render tool call events from stream

**Value**: Dashboard shows real-time tool execution.

### Phase 2: Phase Change Events

Add query state transition events:

1. Controller injects `phase_change` event when updating Query status
2. Dashboard uses phase events for status indicators
3. Remove need for separate Query polling

**Value**: Real-time query status without K8s API polling.

### Phase 3: Question Event Unification

Merge question events into unified stream:

1. When `ask_question` creates question, inject `question_raised` event
2. When question answered, inject `question_answered` event
3. Dashboard renders questions inline with execution

**Value**: Seamless question experience in query flow.

### Phase 4: State Aggregation API

Add resume state API:

1. Broker tracks pending tool calls and blocking conditions
2. New endpoint: `GET /queries/{id}/state`
3. Controller uses state API for resume logic

**Value**: Enables resumable queries.

### Phase 5: Controller Resume Implementation

Implement full resume cycle:

1. Controller watches for `waiting` queries
2. On question answered, controller reconstructs conversation
3. Controller resumes LLM execution with tool result

**Value**: Queries survive restarts while waiting for human input.

## One-Way Decisions

1. **Event format**: Should unified events use a wrapper object (`{event, timestamp, data}`) or extend OpenAI chunk format with additional fields? The wrapper approach is cleaner but breaks OpenAI SDK compatibility for new event types.

2. **Storage scope**: Should the broker persist all events (for replay) or just current state (for resume)? Full persistence enables historical analysis but increases storage requirements.

3. **Service identity**: Should we rename ark-cluster-memory to ark-broker, or keep the current name and add broker capabilities? Renaming clarifies purpose but requires migration.

4. **MCP Tasks adoption**: Should we implement MCP Tasks protocol for all long-running operations, or only for questions? Full MCP Tasks enables broader resumability but requires more implementation effort.

## Conclusion

Positioning ark-broker as the central orchestration service transforms Ark's observability story. Instead of fragmented data sources, users get a unified view of query execution. Instead of fire-and-forget queries, we get resumable, observable, debuggable agent workflows.

The key insight is that the broker already handles streaming and questions - extending it to include tool calls and state transitions completes the picture without introducing new services or complexity.
