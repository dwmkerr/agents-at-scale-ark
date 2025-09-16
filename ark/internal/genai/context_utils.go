package genai

import (
	"context"
)

type contextKey string

const (
	queryIDKey   contextKey = "queryId"
	sessionIDKey contextKey = "sessionId"
	queryNameKey contextKey = "queryName"
	// Execution metadata keys for streaming
	targetKey contextKey = "target" // Original query target (e.g., "team/my-team")
	teamKey   contextKey = "team"   // Current team name
	agentKey  contextKey = "agent"  // Current agent name
	modelKey  contextKey = "model"  // Current model name
)

func WithQueryContext(ctx context.Context, queryID, sessionID, queryName string) context.Context {
	ctx = context.WithValue(ctx, queryIDKey, queryID)
	ctx = context.WithValue(ctx, sessionIDKey, sessionID)
	ctx = context.WithValue(ctx, queryNameKey, queryName)
	return ctx
}

func getQueryID(ctx context.Context) string {
	if val := ctx.Value(queryIDKey); val != nil {
		if queryID, ok := val.(string); ok {
			return queryID
		}
	}
	return ""
}

func getSessionID(ctx context.Context) string {
	if val := ctx.Value(sessionIDKey); val != nil {
		if sessionID, ok := val.(string); ok {
			return sessionID
		}
	}
	return ""
}

// WithExecutionMetadata adds execution metadata to context for streaming
func WithExecutionMetadata(ctx context.Context, metadata map[string]interface{}) context.Context {
	for key, value := range metadata {
		switch key {
		case "target":
			ctx := context.WithValue(ctx, targetKey, value)
		case "team":
			ctx = context.WithValue(ctx, teamKey, value)
		case "agent":
			ctx = context.WithValue(ctx, agentKey, value)
		case "model":
			ctx = context.WithValue(ctx, modelKey, value)
		}
	}
	return ctx
}

// GetExecutionMetadata retrieves execution metadata from context
func GetExecutionMetadata(ctx context.Context) map[string]interface{} {
	metadata := make(map[string]interface{})

	if val := ctx.Value(targetKey); val != nil {
		metadata["target"] = val
	}
	if val := ctx.Value(teamKey); val != nil {
		metadata["team"] = val
	}
	if val := ctx.Value(agentKey); val != nil {
		metadata["agent"] = val
	}
	if val := ctx.Value(modelKey); val != nil {
		metadata["model"] = val
	}

	return metadata
}
