# PostgreSQL Memory Service API Tests
# Test the complete PostgreSQL Memory service functionality

# Test health endpoint
GET http://postgres-memory/health
HTTP 200
[Asserts]
body == "OK"

# Test adding messages to a session
POST http://postgres-memory/messages
Content-Type: application/json
{
  "session_id": "test-session",
  "query_id": "query-1",
  "messages": [
    {
      "role": "user",
      "content": "Hello, this is a test message!"
    }
  ]
}
HTTP 200

# Test retrieving messages from session
GET http://postgres-memory/messages?session_id=test-session
HTTP 200
[Asserts]
jsonpath "$.messages" count == 1
jsonpath "$.messages[0].message.role" == "user"
jsonpath "$.messages[0].message.content" == "Hello, this is a test message!"

# Test adding multiple messages in bulk
POST http://postgres-memory/messages
Content-Type: application/json
{
  "session_id": "bulk-session",
  "query_id": "query-2",
  "messages": [
    {
      "role": "user",
      "content": "First message in bulk"
    },
    {
      "role": "assistant", 
      "content": "Second message in bulk"
    },
    {
      "role": "user",
      "content": "Third message in bulk"
    }
  ]
}
HTTP 200

# Test retrieving bulk messages
GET http://postgres-memory/messages?session_id=bulk-session
HTTP 200
[Asserts]
jsonpath "$.messages" count == 3
jsonpath "$.messages[0].message.role" == "user"
jsonpath "$.messages[0].message.content" == "First message in bulk"
jsonpath "$.messages[1].message.role" == "assistant"
jsonpath "$.messages[1].message.content" == "Second message in bulk"
jsonpath "$.messages[2].message.role" == "user"
jsonpath "$.messages[2].message.content" == "Third message in bulk"

# Test session isolation - different session should have no messages
GET http://postgres-memory/messages?session_id=empty-session
HTTP 200
[Asserts]
jsonpath "$.messages" count == 0

# Test adding another message to original session
POST http://postgres-memory/messages
Content-Type: application/json
{
  "session_id": "test-session",
  "query_id": "query-3",
  "messages": [
    {
      "role": "assistant",
      "content": "Response to the test message"
    }
  ]
}
HTTP 200

# Verify both messages are in the session
GET http://postgres-memory/messages?session_id=test-session
HTTP 200
[Asserts]
jsonpath "$.messages" count == 2

# Test filtering by query_id
GET http://postgres-memory/messages?session_id=test-session&query_id=query-1
HTTP 200
[Asserts]
jsonpath "$.messages" count == 1
jsonpath "$.messages[0].message.content" == "Hello, this is a test message!"

# Test sessions endpoint
GET http://postgres-memory/sessions
HTTP 200
[Asserts]
jsonpath "$.sessions" count >= 2

# Test pagination
GET http://postgres-memory/messages?limit=1&offset=0
HTTP 200
[Asserts]
jsonpath "$.messages" count == 1
jsonpath "$.total" >= 4

# Test complex message with tool calls
POST http://postgres-memory/messages
Content-Type: application/json
{
  "session_id": "tool-session",
  "query_id": "query-4",
  "messages": [
    {
      "role": "assistant",
      "content": "I'll help you with that.",
      "tool_calls": [
        {
          "id": "call_123",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"location\": \"San Francisco\"}"
          }
        }
      ]
    }
  ]
}
HTTP 200

# Retrieve and verify complex message
GET http://postgres-memory/messages?session_id=tool-session
HTTP 200
[Asserts]
jsonpath "$.messages[0].message.tool_calls[0].function.name" == "get_weather"