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

### Checkpoint: 2024-12-07 - MCP Server Registration

#### Goal
Run `devspace dev` and verify the MCPServer is registered and tools are discovered.

#### Verification
```bash
# Deploy with devspace
devspace dev

# Check MCPServer is created
kubectl get mcpserver ark-broker -o yaml

# Verify tools are discovered (check status.toolCount)
kubectl get mcpserver ark-broker -o jsonpath='{.status.toolCount}'
# Expected: 2 (ask_question, list_pending_questions)

# Check conditions
kubectl get mcpserver
# Expected: Available=True
```

#### Results

- MCP server starts on port 8081 ✓
- Health endpoint works ✓
- MCP endpoint responds correctly to curl with proper headers ✓
- Session ID returned in `mcp-session-id` header ✓
- MCPServer resource created and resolves address ✓
- **Blocker**: Ark controller fails with `session not found` error

Controller error:
```
failed to connect MCP client for http://ark-cluster-memory.default.svc.cluster.local:8081/mcp:
calling "initialize": sending "initialize": failed to send: session not found
```

#### Feedback

TypeScript MCP SDK Streamable HTTP server works correctly (verified with curl), but Go MCP SDK client in Ark controller has session handling incompatibility.

#### Next Steps

1. Investigate how filesystem-mcp (TypeScript) works with Ark - does it have the same issue?
2. Check Go MCP SDK session handling
3. Consider implementing MCP server in Go to match controller expectations
4. Or align TypeScript implementation with what Go client expects

---

### Option: Local Development

For local testing without Kubernetes:

```bash
cd services/ark-cluster-memory/ark-cluster-memory
npm install

export PORT=8080
export QUESTIONS_FILE_PATH=/tmp/ark-questions.json
export ENABLE_MCP=false  # REST API only for local testing

npm run dev
```

### Step 1: Create a Question via REST API

```bash
# Create a test question
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "ark://agents/test-agent",
    "recipient": "ark://users/dave",
    "content": "Should I proceed with deployment?",
    "channels": []
  }'

# Expected output: JSON with question ID and status "pending"
# Example:
# {
#   "id": "q-abc123-...",
#   "sender": "ark://agents/test-agent",
#   "recipient": "ark://users/dave",
#   "channels": [],
#   "content": "Should I proceed with deployment?",
#   "status": "pending",
#   "createdAt": "2024-01-15T10:30:00.000Z"
# }
```

### Step 2: List Questions

```bash
# List all questions
curl http://localhost:8080/questions

# Expected: { "questions": [...] }

# Filter by status
curl "http://localhost:8080/questions?status=pending"

# Filter by recipient
curl "http://localhost:8080/questions?recipient=ark://users/dave"
```

### Step 3: Get Specific Question

```bash
# Replace QUESTION_ID with actual ID from step 1
curl http://localhost:8080/questions/QUESTION_ID

# Expected: Full question object
```

### Step 4: Answer a Question

```bash
# Replace QUESTION_ID with actual ID
curl -X PATCH http://localhost:8080/questions/QUESTION_ID \
  -H "Content-Type: application/json" \
  -d '{"response": "Yes, proceed with deployment"}'

# Expected: Updated question with status "answered", response, and answeredAt timestamp
# {
#   "id": "q-abc123-...",
#   "sender": "ark://agents/test-agent",
#   "recipient": "ark://users/dave",
#   "channels": [],
#   "content": "Should I proceed with deployment?",
#   "status": "answered",
#   "response": "Yes, proceed with deployment",
#   "createdAt": "2024-01-15T10:30:00.000Z",
#   "answeredAt": "2024-01-15T10:35:00.000Z"
# }
```

### Step 5: Test SSE Endpoint

```bash
# In one terminal, subscribe to events
curl -N http://localhost:8080/questions/events

# In another terminal, create and answer questions (steps 1 and 4)
# Expected: SSE events in first terminal:
# event: question_created
# data: {"id":"q-...","content":"...","status":"pending"}
#
# event: question_answered
# data: {"id":"q-...","response":"Yes","answeredAt":"..."}
```

### Step 6: Test Persistence

```bash
# Create a question
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{"sender":"ark://agents/test","recipient":"ark://users/dave","content":"Test persistence"}'

# Check the file
cat /tmp/ark-questions.json
# Expected: Array with the question

# Restart the service (Ctrl+C and npm run dev again)

# List questions - should still be there
curl http://localhost:8080/questions
```

### Step 7: Test MCP Server (Future)

MCP server testing requires:
1. An MCP client (e.g., executor-langchain with MCP support)
2. Set ENABLE_MCP=true
3. Configure client to connect via stdio

This will be tested when integrated with an executor.

### Troubleshooting

**Service won't start:**
- Check if port 8080 is already in use: `lsof -i :8080`
- Ensure Node.js >= 22.0.0: `node --version`
- Check for TypeScript compilation errors: `npm run build`

**Questions not persisting:**
- Verify QUESTIONS_FILE_PATH is set
- Check directory permissions for /tmp or configured path
- Look for "[QUESTION SAVE]" log messages

**SSE connection closes immediately:**
- Some tools (like curl) may need -N flag for no-buffering
- Browser DevTools Network tab can show SSE events more reliably

**404 on /questions:**
- Verify service is running: `curl http://localhost:8080/health`
- Check logs for route mounting errors
