---
owner: ark prototyper agent
description: Prototype plan for the ark broker feature
---

# Ark Broker Prototype

## Plan

1. **Question Storage in ark-cluster-memory**
   - Add QuestionStore class (following MemoryStore pattern)
   - Add questions.json file persistence
   - Add event emitter for real-time updates

2. **REST API for Questions**
   - GET /questions - list questions (filter by status, sender, recipient)
   - GET /questions/:id - get specific question
   - POST /questions - create question
   - PATCH /questions/:id - answer question
   - GET /questions/events - SSE endpoint

3. **MCP Server**
   - Add MCP SDK dependency
   - Create MCP server on port 8081
   - Implement ask_question tool (blocks with progress notifications)
   - Implement list_pending_questions tool

4. **Dashboard Questions Page**
   - Add Questions page below Queries in navigation
   - SSE connection for real-time updates
   - List view with pending/answered sections
   - Detail view with answer form

5. **Query CRD Changes** (if time permits)
   - Add `waiting` phase
   - Add `waitingFor` status field

## Status

- [x] QuestionStore class
- [x] questions.json persistence
- [x] REST API endpoints
- [x] SSE endpoint
- [x] MCP server setup
- [x] ask_question tool
- [x] list_pending_questions tool
- [ ] Dashboard Questions page
- [ ] Query CRD changes

## Implementation Notes

### Files Created

1. **src/question-store.ts** - QuestionStore class following MemoryStore pattern
   - File-based persistence with questions.json
   - EventEmitter for real-time updates
   - Methods: createQuestion, answerQuestion, getQuestions, getQuestion, waitForAnswer
   - Auto-load on startup, auto-save on changes

2. **src/routes/questions.ts** - REST API routes
   - GET /questions - list with filters (sender, recipient, status)
   - GET /questions/:id - get specific question
   - POST /questions - create new question
   - PATCH /questions/:id - answer question
   - GET /questions/events - SSE endpoint for real-time updates
   - DELETE /questions - purge all questions

3. **src/mcp-server.ts** - MCP server implementation
   - Uses @modelcontextprotocol/sdk
   - Runs on stdio transport
   - Tools: ask_question (blocking with progress), list_pending_questions
   - Progress notifications every 5 seconds while waiting

4. **src/types.ts** - Added Question, CreateQuestionInput, QuestionFilter interfaces

### Files Modified

1. **package.json** - Added @modelcontextprotocol/sdk dependency
2. **src/server.ts** - Imported QuestionStore, mounted questions routes, exported questions
3. **src/main.ts** - Added ENABLE_MCP env var, questions persistence logging, graceful shutdown

### Architecture Notes

- MCP server is optional (enabled via ENABLE_MCP=true)
- Questions stored in /data/questions.json (via QUESTIONS_FILE_PATH env var)
- SSE endpoint supports real-time dashboard updates
- MCP ask_question tool blocks until answered (supports long-running operations)
- Progress notifications keep MCP client informed while waiting

## Checkpoints

### Checkpoint 1: MCP Server Registration & REST API

#### Goal
Verify MCPServer registers and REST API works.

#### Ports (via devspace)
- **localhost:8082** → REST API
- **localhost:8083** → MCP server

#### Verification

```bash
# 1. Check MCPServer is registered
kubectl get mcpserver ark-broker
# Expected: Available=True, TOOLS=2

# 2. Create a question
curl -X POST http://localhost:8082/questions \
  -H "Content-Type: application/json" \
  -d '{"sender":"ark://agents/test","recipient":"ark://users/dave","content":"Should I proceed?"}'

# 3. List questions
curl http://localhost:8082/questions

# 4. Answer a question (replace QUESTION_ID)
curl -X PATCH http://localhost:8082/questions/QUESTION_ID \
  -H "Content-Type: application/json" \
  -d '{"response": "Yes, proceed"}'

# 5. Watch questions (terminal 1)
curl -N "http://localhost:8082/questions?watch=true"
# Then create/answer questions in terminal 2 and watch events appear
```

#### Results
- MCPServer registered with `transport: http` and named port `mcp` ✓
- REST API works (create, list, answer questions) ✓
- Watch endpoint uses `?watch=true` query param (Kubernetes-style) ✓

---

### Checkpoint 2: Dashboard & Agent Integration (complete)

#### Goal
Test the Dashboard Questions page and verify agents can raise questions via MCP tools.

#### Architecture Gap Discovered
The original architecture didn't include ark-api proxy routes for the questions API. The dashboard was attempting to call a `BROKER_API_URL` directly, but:
- Dashboard runs behind ark-api (same origin)
- Questions API lives in ark-cluster-memory on a separate service
- No proxy existed to bridge dashboard → ark-cluster-memory

**Fix applied:** Added `/v1/questions` proxy routes in ark-api that forward to ark-cluster-memory's broker service. This follows the same pattern as the memories API.

#### Verification
1. Open Dashboard at /questions - verify page loads ✓
2. Create an agent with `ark-broker` MCP server ✓
3. Run a query that triggers `ask_question` tool ✓
4. Answer via Dashboard or REST API ✓
5. Verify query completes with the answer ✓

#### Results
- Dashboard questions page loads and displays questions ✓
- Questions can be answered via Dashboard UI ✓
- End-to-end agent flow verified: agent asks question → answer via dashboard → query completes ✓

#### Findings

During this checkpoint, several findings were documented in `99-findings/`:

1. **Usability issues** (`01-user-experience.md`): Agent creation UX is poor, tool calls not visible in query stream, proposed solution to enhance query detail page.

2. **Resumable queries with MCP Tasks** (`02-resumable-queries.md`): Investigation into whether queries can survive restarts while waiting for human input. Key findings:
   - MCP spec (2025-11-25) added "Tasks" primitive for async/long-running operations
   - LLM calls are stateless - we can replay conversation history to resume
   - Ark memory already stores tool calls correctly
   - True resumability requires: MCP Tasks implementation in ark-broker, Query `waiting` phase, task ID persistence, controller resume logic

These findings are tracked separately and may inform future work beyond the current prototype scope.

---

### Checkpoint 3: Live Query Watching

#### Goal
Add SSE-based real-time updates to the Queries page so you can watch queries appear and change status without refreshing.

#### Implementation

**ark-api (queries.py):**
- Added `?watch=true` query parameter to `GET /v1/queries`
- Uses K8s watch API via `kubernetes_asyncio` to stream query changes
- Returns SSE events with format: `{"type": "added|modified|deleted", "query": {...}}`

**ark-dashboard (queries-section.tsx):**
- Added EventSource connection to `/api/v1/queries?watch=true`
- Auto-updates query list on add/modify/delete events
- Keeps initial fetch via React Query for first load

#### Verification

```bash
# 1. Open dashboard at /queries and keep it open

# 2. In another terminal, create a query
curl -X POST http://localhost:8080/v1/queries \
  -H "Content-Type: application/json" \
  -d '{"name": "test-watch", "input": "Hello", "targets": [{"type": "agent", "name": "default"}]}'

# 3. Watch the query appear in the dashboard without refreshing

# 4. The query status should update as it progresses (pending → running → done)
```

#### Results
- [ ] SSE endpoint streams K8s watch events
- [ ] Dashboard queries page updates in real-time
- [ ] New queries appear without refresh
- [ ] Status changes reflect immediately
