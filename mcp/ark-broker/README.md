# ark-broker

MCP server for async agent-user communication.

## Quickstart

```bash
# Show all available recipes
make help

# Build Docker image
make build

# Run locally
make run
```

## Development

```bash
# Run server
go run *.go

# Test REST API
curl http://localhost:8080/questions

# Stream events
curl http://localhost:8080/questions/events
```

## REST API

- `GET /questions` - List questions (filter with `?status=pending`)
- `GET /questions/{id}` - Get question by ID
- `PATCH /questions/{id}` - Answer question with `{"response": "..."}`
- `GET /questions/events` - SSE stream of question updates
