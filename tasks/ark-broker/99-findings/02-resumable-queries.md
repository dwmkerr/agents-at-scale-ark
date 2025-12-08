# Resumable Queries with Stable MCP Asynchronous Tasks

## Objective

Enable agents to ask questions that require human input (via ark-broker) without requiring persistent connections. The question feature revealed a generalised requirement: **Ark should support truly resumable queries for any MCP server that supports async tasks.**

## The Problem

When an agent calls `ask_question`, the current flow requires:
1. LLM connection stays open waiting for tool result
2. MCP connection stays open waiting for answer
3. Executor/controller must stay alive

If any component restarts, the query is lost.

## Key Insight: LLM Calls Are Stateless

LLMs don't maintain state between API calls. When we send a conversation history with a tool call and its result, the LLM simply continues from that point. This means:

1. LLM returns: "call tool X with `tool_call_id: abc123`"
2. We **checkpoint**: store conversation + tool call request
3. Query enters "waiting" state, connections can close
4. Human answers (minutes/hours later)
5. We **resume**: replay conversation + tool call + tool result to LLM
6. LLM continues as if nothing happened

The LLM sees the same messages either way - it doesn't know we paused.

## MCP Tasks Specification (2025-11-25)

The MCP spec added "Tasks" specifically for long-running and async operations:

- **Spec**: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
- **Announcement**: https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/
- **Overview**: https://workos.com/blog/mcp-2025-11-25-spec-update
- **Deep dive**: https://dev.to/gregory_dickson_6dd6e2b55/mcp-gets-tasks-a-game-changer-for-long-running-ai-operations-2kel
- **Original proposal**: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391

### What MCP Tasks Provides

1. **Non-blocking tool calls**: Server returns `taskId` immediately, not after completion
2. **Durable state**: Task state persists on MCP server, survives reconnects
3. **Polling/retrieval**: Client can call `tasks/get` (status) or `tasks/result` (blocking wait)
4. **Task states**: `working` → `input_required` → `completed`/`failed`/`cancelled`

### Why MCP Tasks Is Essential for Resumability

**Without MCP Tasks**: Each tool call is fire-and-forget. If we restart and replay the conversation, the LLM generates the same tool call, but the MCP server creates a NEW task with a new ID. The old question/answer is orphaned - there's no way to say "I already called this, give me the result".

**With MCP Tasks**: We store the `taskId` alongside the `tool_call_id`. After restart, we call `tasks/result` with the same `taskId` and retrieve the answer that was provided while we were down. The MCP server maintains the mapping: `taskId → question state → answer`.

## Memory Already Stores Tool Calls ✓

Investigation of the Ark codebase confirms that memory **does** properly store tool calls:

1. `Message` type is `openai.ChatCompletionMessageParamUnion` which includes tool calls
2. `agent.go:213-216` captures assistant messages via `choice.Message.ToParam()` including `ToolCalls`
3. `agent.go:174-175` appends tool result messages to `newMessages`
4. `query_controller.go:742` saves all messages via `memory.AddMessages()`

So the conversation history in memory includes:
- Assistant messages with `tool_calls` array (the request)
- Tool messages with `tool_call_id` (the response)

**This means the conversation state needed for resumption is already being persisted.**

## What's Missing for Full Resumability

### 1. Task ID Persistence

Need to store the mapping between:
- `tool_call_id` (from LLM, in memory)
- `taskId` (from MCP server, for retrieval)

Options:
- Store in Query status: `waitingFor: {taskId: "q-xyz", toolCallId: "abc123"}`
- Store in memory as metadata on the tool call message

### 2. Query "Waiting" Phase

Query needs a `waiting` phase to indicate it's blocked on an async task:
- Current phases: `pending`, `running`, `completed`, `failed`
- New phase: `waiting` (blocked on external input)

### 3. ark-broker MCP Tasks Implementation

Update ark-broker to implement MCP Tasks protocol:
- Return `{task: {taskId, status: "working"}}` immediately on `ask_question`
- Support `tasks/get` for status polling
- Support `tasks/result` for blocking retrieval
- Question ID can serve as task ID (already persisted)

### 4. Ark Controller Task Handling

Update Go MCP client and controller to:
- Detect task-based responses (non-blocking)
- Store task ID mapping
- Transition Query to `waiting` phase
- On task completion (via polling or notification), reconstruct and resume LLM call

## Resumption Flow

```
1. Query starts, LLM returns tool call for ask_question
2. Controller calls MCP → gets taskId immediately (no blocking)
3. Controller stores: {queryId, taskId, tool_call_id}
4. Controller saves conversation to memory (includes tool call)
5. Query status → "waiting", connections close

   --- Controller can restart here, no problem ---

6. Human answers question via dashboard
7. ark-broker stores answer, task status → "completed"
8. Controller polls tasks/get or receives notification
9. Controller calls tasks/result → gets answer
10. Controller loads conversation from memory
11. Controller appends tool result message
12. Controller makes NEW LLM call with full history
13. LLM continues from where it "left off"
14. Query completes
```

## Scope

**Questions are an example implementation.** This pattern applies to any long-running MCP tool:
- Human approvals
- External system integrations with async responses
- Long-running computations
- Webhook-triggered completions

Any MCP server implementing the Tasks spec could participate in resumable queries.

## Implementation Priority

1. **ark-broker MCP Tasks** - Implement Tasks protocol (return taskId, support tasks/get, tasks/result)
2. **Query waiting phase** - Add `waiting` status and `waitingFor` field
3. **Task ID persistence** - Store taskId ↔ toolCallId mapping
4. **Controller resume logic** - Detect completion, reconstruct, resume

## Summary

| Component | Current State | Status |
|-----------|--------------|--------|
| Memory stores tool calls | Yes | ✓ Already working |
| MCP Tasks in ark-broker | No | Needs implementation |
| Query waiting phase | No | Needs implementation |
| Task ID persistence | No | Needs implementation |
| Controller checkpoint/resume | No | Needs implementation |
