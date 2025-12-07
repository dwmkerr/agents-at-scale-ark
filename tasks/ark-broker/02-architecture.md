---
owner: ark planner agent
description: Proposed architecture for the ark broker component with sample questions via slack
---

# Ark Broker Architecture

## Overview

Ark Broker is an MCP server that enables agents to ask questions and block until answers are provided. Questions are stored in a `questions.json` file (following existing filesystem-mcp patterns), and the broker manages Query waiting state by patching the Query CRD status. This keeps all complexity in one service - the broker handles storage, waiting, and status updates.

## MCP Long-Running Operations

MCP supports long-running operations via progress notifications. The `ask_question` tool uses this pattern:

1. Agent calls tool with `progressToken`
2. Broker sends progress notifications while waiting ("Question pending", "Delivered to channel", etc.)
3. When answered, tool returns response

This eliminates timeout concerns - the tool can wait indefinitely while keeping the client informed.

## Component Diagram

```
                                    Ark Platform
+--------------------------------------------------------------------------------+
|                                                                                |
|  +------------------+     +-----------------------+     +------------------+   |
|  |   Query          |     |   Agent/Executor      |     |   Dashboard      |   |
|  |   Controller     |     |                       |     |   (UI)           |   |
|  +------------------+     +-----------+-----------+     +--------+---------+   |
|          ^                            |                          |             |
|          |                            | MCP tool call:           |             |
|          | Watches                    | ask_question()           |             |
|          | phase: waiting             | (with progressToken)     |             |
|          |                  +---------v-----------+              |             |
|          |                  |                     |              |             |
|          +------------------+   ark-broker        |<-------------+             |
|             Patches status  |   (MCP Server)      |  REST API:                 |
|             waitingFor      |                     |  POST /questions/:id/answer|
|                             +----------+----------+                            |
|                                        |                                       |
|                                        | Read/Write                            |
|                                        |                                       |
|                             +----------v----------+                            |
|                             |                     |                            |
|                             |  questions.json     |                            |
|                             |  (PVC storage)      |                            |
|                             |                     |                            |
|                             +---------------------+                            |
|                                                                                |
+--------------------------------------------------------------------------------+

**Note:** All questions are always visible via the REST API and Ark Dashboard, regardless of
which channel they are routed to. This provides: (1) convenience for quick answers,
(2) troubleshooting visibility for stuck/pending questions, and (3) a fallback if a channel fails.
```

## Data Model

### Question Schema

Questions are stored as JSON records in `/data/questions.json`:

```json
{
  "id": "q-abc123",
  "sender": "ark://agents/code-reviewer",
  "recipient": "ark://users/john.doe",
  "channels": [],
  "content": "Should I proceed with merging this PR?",
  "status": "pending",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

When answered:

```json
{
  "id": "q-abc123",
  "sender": "ark://agents/code-reviewer",
  "recipient": "ark://users/john.doe",
  "channels": [],
  "content": "Should I proceed with merging this PR?",
  "status": "answered",
  "response": "Yes, approved for merge",
  "createdAt": "2024-01-15T10:30:00Z",
  "answeredAt": "2024-01-15T10:35:00Z"
}
```

### Sender/Recipient URL Format

```
ark://agents/{agent-name}
ark://users/{user-id}
ark://teams/{team-name}
ark://channels/{channel-name}
```

### Query CRD Changes

Add `waiting` phase and `waitingFor` status field with `since` timestamp:

```yaml
apiVersion: ark.ai/v1alpha1
kind: Query
metadata:
  name: my-query
  namespace: default
spec:
  input: "Review this code"
  targets:
    - type: agent
      name: code-reviewer
status:
  phase: "waiting"
  waitingFor:
    since: "2024-01-15T10:30:00Z"
    question:
      id: "q-abc123"
```

When no longer waiting:

```yaml
status:
  phase: "running"
  # waitingFor cleared
```

## Execution Flows

### Flow 1: Agent Asks Question (MCP)

```
1. Agent calls ask_question tool
   - Includes progressToken for long-running support
   |
2. Broker creates question in questions.json
   - id: "q-abc123"
   - status: "pending"
   - sender: "ark://agents/{agent-name}"
   |
3. Broker patches Query CRD status
   - phase: "waiting"
   - waitingFor.since: current timestamp
   - waitingFor.question.id: "q-abc123"
   |
4. If channel specified (e.g., "slack", "github")
   → Broker posts notification to channel
   |
   If no channel
   → Question waits for discovery via REST API
   |
5. Broker sends progress notifications periodically
   - "Question pending..."
   - "Delivered to slack channel..."
   - "Waiting for response..."
   |
6. Tool blocks until question status becomes "answered"
   |
7. Tool returns answer to agent
```

### Flow 2: User Answers Question (Channel/API)

```
1. User discovers pending questions
   - Via REST API: GET /questions?status=pending
   - Via channel notification (Slack, GitHub, etc.)
   |
2. User submits answer
   - Via REST API: PATCH /questions/q-abc123
   - Via channel reply (future)
   |
3. Broker updates questions.json
   - status: "answered"
   - response: "Yes, proceed with deployment"
   - answeredAt: current timestamp
   |
4. Broker patches Query CRD status
   - phase: "running"
   - waitingFor: cleared
   |
5. MCP tool unblocks and returns answer to agent
   - questionId: "q-abc123"
   - response: "Yes, proceed with deployment"
   - answeredAt: "2024-01-15T10:35:00Z"
```

## API Design

### MCP Tools

**ask_question** - Blocks until the question is answered

Input:
```json
{
  "recipient": "ark://users/john",
  "content": "Should I proceed with the deployment?",
  "channels": []
}
```

Output:
```json
{
  "questionId": "q-abc123",
  "response": "Yes, proceed",
  "answeredAt": "2024-01-15T10:35:00Z"
}
```

Progress notifications (sent periodically while waiting):
```json
{
  "progress": 0,
  "total": 0,
  "message": "Question pending - waiting for response..."
}
```

**list_pending_questions** - Returns pending questions for the calling agent

Output:
```json
{
  "questions": [
    {
      "id": "q-abc123",
      "recipient": "ark://users/john",
      "content": "Should I proceed?",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | /questions | List questions (filter by recipient, status, sender) |
| GET | /questions/:id | Get a specific question |
| PATCH | /questions/:id | Answer a question with `{ "response": "..." }` |

## Implementation Phases

### Phase 1: Core Question Infrastructure
- `questions.json` storage with read/write functions
- Basic ark-broker MCP server with `ask_question` tool (with progress notifications)
- REST API for listing and answering questions
- Unit tests

**Value:** Agents can ask questions; answers can be provided via REST API

### Phase 2: Query Status Integration
- Add `waiting` phase to Query CRD
- Add `waitingFor` status field with `since` timestamp
- ark-broker patches Query status when waiting/resuming

**Value:** Kubernetes-native visibility into waiting queries

### Phase 3: Dashboard Integration
- Dashboard UI for viewing pending questions
- Dashboard UI for answering questions
- Real-time updates via polling or WebSocket

**Value:** Users can see and answer questions through the dashboard

### Phase 4: Multi-Channel Support (Future)
- Channel routing based on `channels` array
- Slack adapter
- GitHub adapter

**Value:** Questions delivered via Slack DM, GitHub comments, etc.
