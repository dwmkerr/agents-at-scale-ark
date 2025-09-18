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
	// Check each metadata field explicitly to avoid fatcontext warning
	if target, ok := metadata["target"]; ok {
		ctx = context.WithValue(ctx, targetKey, target)
	}
	if team, ok := metadata["team"]; ok {
		ctx = context.WithValue(ctx, teamKey, team)
	}
	if agent, ok := metadata["agent"]; ok {
		ctx = context.WithValue(ctx, agentKey, agent)
	}
	if model, ok := metadata["model"]; ok {
		ctx = context.WithValue(ctx, modelKey, model)
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
