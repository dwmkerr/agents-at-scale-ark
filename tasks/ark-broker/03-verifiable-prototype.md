---
owner: ark prototyper agent
description: Prototype plan for the ark broker feature
---

# Ark Broker Prototype

## Plan

1. **Query CRD Changes**
   - Add `waiting` to phase enum in QueryStatus
   - Add `waitingFor` field with `since` timestamp and `question.id`

2. **ark-broker MCP Server**
   - Create new Go service in `mcp/ark-broker/`
   - Implement questions.json file storage (read/write/update)
   - Implement REST API with GET/POST/PATCH endpoints
   - Implement MCP server with `ask_question` and `list_pending_questions` tools
   - Use MCP progress notifications for long-running ask_question

3. **Dashboard Integration**
   - Add Questions page at `services/ark-dashboard/ark-dashboard/app/(dashboard)/questions/page.tsx`
   - Implement SSE (Server-Sent Events) endpoint for real-time updates
   - Create simple list view showing pending questions
   - Create detail view with answer form

## Status

- [x] Create prototype plan
- [x] Query CRD changes
- [x] ark-broker MCP server structure
- [x] questions.json storage
- [x] REST API endpoints
- [x] SSE endpoint for real-time updates
- [x] MCP tools (ask_question, list_pending_questions)
- [x] Dashboard Questions page
- [x] Navigation integration
- [ ] End-to-end testing (manual verification pending)

## Implementation Notes

### What Was Already Implemented

The prototype was already fully implemented on the `spike/ark-broker` branch before this agent started work. All three major components were complete:

1. **Query CRD Changes** (in `/ark/api/v1alpha1/query_types.go`):
   - `waiting` added to phase enum (line 137)
   - `WaitingFor` struct with `Since` and `Question` fields (lines 130-133)
   - `waitingFor` field added to QueryStatus (line 147)

2. **ark-broker MCP Server** (in `/mcp/ark-broker/`):
   - Complete Go implementation with 5 files
   - `storage.go`: JSON file storage with pub/sub for real-time updates
   - `api.go`: REST API with CORS support and SSE endpoint
   - `mcp.go`: MCP server with ask_question and list_pending_questions tools
   - `types.go`: Question data structures
   - `main.go`: Server initialization

3. **Dashboard Questions Page** (in `/services/ark-dashboard/ark-dashboard/`):
   - Questions page at `app/(dashboard)/questions/page.tsx`
   - Questions section component with SSE integration
   - Navigation already includes Questions in Operations section
   - Real-time updates via EventSource connection

### Architecture Decisions

1. **MCP Server in Go**: Following existing MCP server patterns in the codebase
2. **questions.json Storage**: Simple file-based storage with in-memory pub/sub for SSE
3. **SSE for Dashboard**: Lightweight real-time updates without WebSocket complexity
4. **Minimal CRD Changes**: Only adding required fields to Query status
5. **CORS Support**: API server includes CORS headers for browser access

### Key Files to Create/Modify

**CRD Changes:**
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/ark/api/v1alpha1/query_types.go`

**New MCP Server:**
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker/` (new directory)
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker/main.go`
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker/storage.go`
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker/api.go`
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker/mcp.go`

**Dashboard:**
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/services/ark-dashboard/ark-dashboard/app/(dashboard)/questions/page.tsx`
- `/Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/services/ark-dashboard/ark-dashboard/app/api/questions/route.ts` (SSE endpoint)

## Verification

All components are implemented. Follow these steps to verify the prototype works end-to-end.

### Prerequisites

1. **Deploy Ark to your cluster**
```bash
cd /Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark
devspace dev
```

2. **Build and run ark-broker locally**
```bash
cd /Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker
mkdir -p data
go run . -data-dir ./data -port 8080
```

Keep this running in a separate terminal. You should see:
```
Starting ark-broker on port 8080
Questions storage: ./data/questions.json
REST API: http://localhost:8080/questions
SSE Events: http://localhost:8080/questions/events
```

3. **Configure dashboard to connect to broker**
```bash
cd /Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/services/ark-dashboard/ark-dashboard
export NEXT_PUBLIC_BROKER_API_URL=http://localhost:8080
npm run dev
```

### Step 1: Verify Query CRD Changes

The `waiting` phase and `waitingFor` fields are already in the CRD schema.

```bash
# Check CRD includes new fields
kubectl get crd queries.ark.mckinsey.com -o yaml | grep -A 10 "waitingFor"
```

Expected output should show the `waitingFor` schema with `since` and `question` fields.

### Step 2: Verify ark-broker REST API

Test the REST API endpoints:

```bash
# List all questions (should be empty initially)
curl http://localhost:8080/questions

# Create a test question
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "ark://agents/test-agent",
    "recipient": "ark://users/john",
    "content": "Should I proceed with the deployment?",
    "channels": []
  }'

# List questions again (should show the new question)
curl http://localhost:8080/questions

# Get a specific question (replace q-abc123 with actual ID from response)
curl http://localhost:8080/questions/q-abc123

# Answer the question (replace q-abc123 with actual ID)
curl -X PATCH http://localhost:8080/questions/q-abc123 \
  -H "Content-Type: application/json" \
  -d '{"response": "Yes, proceed with deployment"}'

# Verify the question is now answered
curl http://localhost:8080/questions/q-abc123
```

### Step 3: Verify SSE Real-Time Updates

In one terminal, subscribe to question events:

```bash
curl -N http://localhost:8080/questions/events
```

In another terminal, create a question:

```bash
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "ark://agents/test",
    "recipient": "ark://users/test",
    "content": "Test SSE?",
    "channels": []
  }'
```

You should see the question appear in the SSE stream immediately.

### Step 4: Verify Dashboard Questions Page

1. **Open the dashboard**: Navigate to http://localhost:3000

2. **Go to Questions page**: Click "Questions" in the Operations section of the sidebar

3. **Verify empty state**: If no questions exist, you should see "No Questions" message

4. **Create a question via API**:
```bash
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "ark://agents/code-reviewer",
    "recipient": "ark://users/john",
    "content": "I found a potential security issue in the authentication module. Should I create a ticket or fix it immediately?",
    "channels": []
  }'
```

5. **Verify real-time update**: The question should appear in the dashboard immediately (via SSE) without refreshing

6. **Click the question**: Click on the question card to see the detail view

7. **Answer the question**:
   - Type an answer in the textarea (e.g., "Please create a ticket first and tag it as security-critical")
   - Click "Submit Answer"
   - Verify success toast appears
   - Verify you're returned to the questions list
   - Verify the question now shows in the "Answered" section

8. **Check browser DevTools**:
   - Open Network tab
   - Look for `questions/events` request
   - Verify it's an EventSource connection with status "pending"

### Step 5: Verify MCP Tools (Simulated)

The MCP server is implemented but requires an MCP client to test. To verify the implementation:

1. **Check the code**:
```bash
cd /Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker
cat mcp.go
```

2. **Verify ask_question tool**:
   - Creates a question via storage
   - Polls for answer every 5 seconds
   - Sends progress notifications
   - Returns answer when received

3. **Verify list_pending_questions tool**:
   - Lists all questions with status "pending"

### Step 6: End-to-End Flow Test

Simulate the complete flow:

1. **Create a question** (simulating an agent asking):
```bash
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "ark://agents/deployment-agent",
    "recipient": "ark://users/alice",
    "content": "Deployment to production requires manual approval. Proceed?",
    "channels": []
  }'
```

2. **Verify in dashboard**:
   - Open http://localhost:3000/questions
   - See the question appear immediately
   - Count shows "1 Pending, 0 Answered"

3. **Answer the question**:
   - Click the question card
   - Type answer: "Approved - proceed with deployment"
   - Click Submit Answer

4. **Verify the answer**:
```bash
curl http://localhost:8080/questions | jq '.[] | select(.status == "answered")'
```

5. **Check the questions.json file**:
```bash
cat /Users/Dave_Kerr/repos/github/mckinsey/agents-at-scale-ark/mcp/ark-broker/data/questions.json
```

You should see both pending and answered questions with timestamps.

### Expected Results

✅ Query CRD includes `waiting` phase and `waitingFor` fields
✅ ark-broker REST API responds to GET/POST/PATCH requests
✅ SSE endpoint streams question updates in real-time
✅ Dashboard Questions page displays questions with real-time updates
✅ Questions can be answered via dashboard UI
✅ Questions are persisted to questions.json file
✅ Navigation includes Questions link under Operations

### Troubleshooting

**Dashboard can't connect to broker**:
- Verify broker is running on port 8080
- Check CORS headers in API responses
- Verify NEXT_PUBLIC_BROKER_API_URL environment variable

**SSE not working**:
- Check browser console for errors
- Verify EventSource connection in Network tab
- Ensure broker has CORS headers for SSE endpoint

**Questions not persisting**:
- Check data directory permissions
- Verify questions.json file is writable
- Check broker logs for storage errors
