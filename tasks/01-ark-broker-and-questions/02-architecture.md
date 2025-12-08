---
owner: ark planner agent
description: Proposed architecture for the ark broker feature with sample questions via slack
---

# Ark Broker Architecture

## Overview

Ark Broker functionality is added directly to ark-cluster-memory rather than as a separate service. The existing ark-cluster-memory service (TypeScript/Express) gains questions storage, REST endpoints, and an MCP server interface. This keeps deployment simple since ark-cluster-memory already handles state and persistence. MCP is just another protocol surface alongside REST.

## Rationale for Integration

1. **Simpler deployment**: No new Kubernetes resources, Helm charts, or service discovery
2. **Existing state management**: ark-cluster-memory already handles file persistence, graceful shutdown, and event-driven updates
3. **Pattern consistency**: Questions storage follows the same patterns as memory and stream storage
4. **Future rename**: ark-cluster-memory may later be renamed to ark-broker to reflect expanded scope

## MCP Long-Running Operations

MCP supports long-running operations via progress notifications. The `ask_question` tool uses this pattern:

1. Agent calls tool with `progressToken`
2. Service sends progress notifications while waiting ("Question pending", "Delivered to channel", etc.)
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
|          +------------------+ ark-cluster-memory  |<-------------+             |
|             Patches status  | (Express server)    |  REST API:                 |
|             waitingFor      |                     |  POST /questions/:id/answer|
|                             |  APIs:              |                            |
|                             |  - /messages (mem)  |                            |
|                             |  - /stream          |                            |
|                             |  - /questions (NEW) |                            |
|                             |  - MCP server (NEW) |                            |
|                             +----------+----------+                            |
|                                        |                                       |
|                                        | Read/Write                            |
|                                        |                                       |
|                             +----------v----------+                            |
|                             |  PVC Storage        |                            |
|                             |  - memory.json      |                            |
|                             |  - streams.json     |                            |
|                             |  - questions.json   |                            |
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
2. ark-cluster-memory creates question in questions.json
   - id: "q-abc123"
   - status: "pending"
   - sender: "ark://agents/{agent-name}"
   |
3. ark-cluster-memory patches Query CRD status
   - phase: "waiting"
   - waitingFor.since: current timestamp
   - waitingFor.question.id: "q-abc123"
   |
4. If channel specified (e.g., "slack", "github")
   → Service posts notification to channel
   |
   If no channel
   → Question waits for discovery via REST API
   |
5. Service sends progress notifications periodically
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
3. ark-cluster-memory updates questions.json
   - status: "answered"
   - response: "Yes, proceed with deployment"
   - answeredAt: current timestamp
   |
4. ark-cluster-memory patches Query CRD status
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

### Watch Mode (SSE)

Add `?watch=true` to stream real-time updates (Kubernetes-style):

```bash
curl -N "http://localhost:8082/questions?watch=true"
```

Events:
```
event: question_created
data: {"id":"q-abc123","sender":"ark://agents/test","content":"...","status":"pending"}

event: question_answered
data: {"id":"q-abc123","response":"Yes","answeredAt":"2024-01-15T10:35:00Z"}
```

## Implementation Details

### ark-cluster-memory Changes

The existing TypeScript service at `services/ark-cluster-memory/ark-cluster-memory/` requires:

1. **New files**:
   - `src/question-store.ts` - QuestionStore class (similar to MemoryStore)
   - `src/routes/questions.ts` - REST endpoints router
   - `src/mcp-server.ts` - MCP server implementation

2. **Modified files**:
   - `src/server.ts` - Mount question routes and start MCP server
   - `src/main.ts` - Add QUESTIONS_FILE_PATH env var handling
   - `package.json` - Add MCP SDK dependency (`@modelcontextprotocol/sdk`)

3. **New environment variables**:
   - `QUESTIONS_FILE_PATH` - Path to questions.json (e.g., `/data/questions.json`)
   - `MCP_PORT` - Port for MCP server (e.g., `8081`)

### QuestionStore Pattern

Following MemoryStore patterns:

```typescript
export class QuestionStore {
  private questions: Question[] = [];
  private readonly questionsFilePath?: string;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    this.questionsFilePath = process.env.QUESTIONS_FILE_PATH;
    this.loadFromFile();
  }

  createQuestion(question: CreateQuestionInput): Question { ... }
  answerQuestion(id: string, response: string): Question { ... }
  getQuestions(filter?: QuestionFilter): Question[] { ... }
  getQuestion(id: string): Question | undefined { ... }
  waitForAnswer(id: string, timeout?: number): Promise<string> { ... }
}
```

### MCP Server Integration

The MCP server runs on a separate port and exposes question tools:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const mcpServer = new Server({
  name: "ark-cluster-memory",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "ask_question", description: "Ask a question and wait for answer", ... },
    { name: "list_pending_questions", description: "List pending questions", ... }
  ]
}));
```

## Implementation Phases

### Phase 1: Core Question Infrastructure
- Add QuestionStore class following MemoryStore patterns
- Add questions.json storage with read/write functions
- Add REST API routes (/questions endpoints)
- Add SSE endpoint for real-time updates
- Unit tests

**Value:** Questions can be created and answered via REST API

### Phase 2: MCP Server Integration
- Add MCP SDK dependency
- Implement MCP server with ask_question and list_pending_questions tools
- Configure MCP port in Helm chart
- Integration tests

**Value:** Agents can ask questions via MCP tools

### Phase 3: Query Status Integration
- Add `waiting` phase to Query CRD
- Add `waitingFor` status field with `since` timestamp
- ark-cluster-memory patches Query status when waiting/resuming
- Kubernetes RBAC for Query patching

**Value:** Kubernetes-native visibility into waiting queries

### Phase 4: Dashboard Integration
- Dashboard UI for viewing pending questions
- Dashboard UI for answering questions
- Real-time updates via SSE connection

**Value:** Users can see and answer questions through the dashboard

### Phase 5: Multi-Channel Support (Future)
- Channel routing based on `channels` array
- Slack adapter
- GitHub adapter

**Value:** Questions delivered via Slack DM, GitHub comments, etc.

## Decisions

1. **MCP server port**: MCP runs on a separate port (8081). Simpler than multiplexing.

2. **Question ID format**: `q-` prefix with UUID.

3. **Query patching scope**: ark-cluster-memory has its own Role (similar to ark-api) with permissions on all Ark resources in the namespace.

## Open Questions

1. **MCP load balancing**: MCP connections are stateful (long-running, progress notifications). Kubernetes services load balance across pods, which could break MCP sessions if:
   - Multiple ark-cluster-memory replicas exist
   - A pod restarts mid-session

   Options to consider:
   - **Single replica**: Keep ark-cluster-memory at 1 replica (simplest, but no HA)
   - **Sticky sessions**: Use session affinity on the MCP service
   - **Pod-direct addressing**: MCPServer resource points to specific pod (executor connects directly)
   - **Stateless MCP**: Store MCP session state in shared storage (questions.json already shared via PVC)

   For prototype: Single replica is fine. Production needs further design.

## Deployment

### DevSpace

Regular `devspace dev` installs the MCPServer resource (disabled by default in chart, enabled in devspace.yaml).

```bash
devspace dev
```

This will:
1. Deploy ark-cluster-memory with MCP server enabled (port 8081)
2. Install MCPServer resource pointing to ark-cluster-memory service
3. Tools are discovered automatically by Ark

### MCPServer Resource

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: MCPServer
metadata:
  name: ark-broker
spec:
  transport: http
  address:
    valueFrom:
      serviceRef:
        name: ark-cluster-memory
        port: mcp
  description: "Broker for agent-user questions"
  timeout: "30m"
```

Tools (`ask_question`, `list_pending_questions`) are discovered automatically - no need to list them in the spec.

## Addendum: Watch Pattern with ResourceVersion

The watch endpoint uses Kubernetes-style `resourceVersion` to avoid flooding clients with existing data on connect:

1. **List returns resourceVersion**: `GET /questions` includes a monotonic counter that increments on every create/update/delete
2. **Watch accepts resourceVersion**: `GET /questions?watch=true&resourceVersion=X` streams only changes after that version
3. **Dashboard flow**: Initial fetch gets data + resourceVersion, then SSE watch uses that resourceVersion
4. **Benefit**: Clients receive only new events, not ADDED events for all existing resources

Example:
```bash
# Initial fetch
curl http://localhost:8082/questions
# Response includes: { "resourceVersion": "42", "items": [...] }

# Watch from that point forward
curl -N "http://localhost:8082/questions?watch=true&resourceVersion=42"
# Only streams changes after version 42
```
