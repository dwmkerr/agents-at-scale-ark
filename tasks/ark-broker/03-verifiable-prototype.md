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
- [ ] Query CRD changes
- [ ] ark-broker MCP server structure
- [ ] questions.json storage
- [ ] REST API endpoints
- [ ] MCP tools
- [ ] Dashboard Questions page
- [ ] End-to-end testing

## Implementation Notes

### Architecture Decisions

1. **MCP Server in Go**: Following existing MCP server patterns in the codebase
2. **questions.json Storage**: Simple file-based storage, similar to filesystem-mcp patterns
3. **SSE for Dashboard**: Lightweight real-time updates without WebSocket complexity
4. **Minimal CRD Changes**: Only adding required fields to Query status

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

### 1. Query CRD Changes
```bash
# Check CRD includes new fields
kubectl get crd queries.ark.ai -o yaml | grep -A 5 "waitingFor"

# Create test query
kubectl apply -f - <<EOF
apiVersion: ark.ai/v1alpha1
kind: Query
metadata:
  name: test-waiting
spec:
  input: "test"
  targets:
    - type: agent
      name: test
status:
  phase: waiting
  waitingFor:
    since: "2024-01-15T10:30:00Z"
    question:
      id: "q-test123"
EOF

# Verify status was set
kubectl get query test-waiting -o jsonpath='{.status.waitingFor}'
```

### 2. ark-broker MCP Server
```bash
# Build and run ark-broker
cd mcp/ark-broker
make build
docker run -v $(pwd)/data:/data ark-broker:latest

# Test REST API
curl http://localhost:8080/questions
curl -X POST http://localhost:8080/questions \
  -H "Content-Type: application/json" \
  -d '{"recipient":"ark://users/test","content":"Test question?"}'
curl -X PATCH http://localhost:8080/questions/q-abc123 \
  -H "Content-Type: application/json" \
  -d '{"response":"Test answer"}'

# Check questions.json file
cat data/questions.json
```

### 3. MCP Tools
```bash
# Test via MCP client (e.g., Claude Desktop or ark-mcp)
# Call ask_question tool
{
  "recipient": "ark://users/john",
  "content": "Should I proceed?",
  "channels": []
}

# Verify it blocks and sends progress notifications
# Answer via REST API
# Verify tool returns the answer
```

### 4. Dashboard Questions Page
1. Navigate to http://localhost:3000/questions
2. Verify questions list displays pending questions
3. Click a question to see detail view
4. Type an answer and submit
5. Verify question status updates to "answered" in real-time
6. Check SSE connection in browser DevTools Network tab

### End-to-End Flow
1. Agent calls `ask_question` MCP tool
2. Question appears in dashboard Questions page (via SSE)
3. User clicks question, types answer, submits
4. MCP tool unblocks and returns answer to agent
5. Query status changes from `waiting` to `running`
