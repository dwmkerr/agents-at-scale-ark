package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/shared/constant"
	"mckinsey.com/ark/internal/common"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type OpenAIProvider struct {
	Model      string
	BaseURL    string
	APIKey     string
	Properties map[string]string
}

func (op *OpenAIProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    op.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(op.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	client := op.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

// accumulateStreamChunk processes a streaming chunk and accumulates content and tool calls.
// Per OpenAI specification (https://platform.openai.com/docs/guides/function-calling#streaming),
// tool calls in streaming responses are fragmented across multiple chunks:
// - First chunk contains: {index: 0, id: "call_123", type: "function", function: {name: "get_weather", arguments: ""}}
// - Subsequent chunks contain: {index: 0, function: {arguments: "{\"loc"}}
// - More chunks: {index: 0, function: {arguments: "ation\": \"Boston\"}"}}
// We must accumulate these fragments by index to reconstruct complete tool calls.
func accumulateStreamChunk(chunk *openai.ChatCompletionChunk, fullResponse **openai.ChatCompletion, toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall) {
	if *fullResponse == nil {
		*fullResponse = &openai.ChatCompletion{
			ID:      chunk.ID,
			Object:  "chat.completion",
			Created: chunk.Created,
			Model:   chunk.Model,
			Choices: []openai.ChatCompletionChoice{},
		}
	}

	if len(chunk.Choices) == 0 {
		return
	}

	choice := &chunk.Choices[0]

	if len((*fullResponse).Choices) == 0 {
		(*fullResponse).Choices = append((*fullResponse).Choices, openai.ChatCompletionChoice{
			Index:   choice.Index,
			Message: openai.ChatCompletionMessage{},
		})
	}

	// Accumulate role (usually comes in first chunk)
	if choice.Delta.Role != "" {
		(*fullResponse).Choices[0].Message.Role = constant.Assistant(choice.Delta.Role)
	}

	if choice.Delta.Content != "" {
		(*fullResponse).Choices[0].Message.Content += choice.Delta.Content
	}

	// Accumulate tool calls per OpenAI streaming specification
	for _, deltaToolCall := range choice.Delta.ToolCalls {
		if existingCall, exists := toolCallsMap[deltaToolCall.Index]; exists {
			// Subsequent chunks only contain argument fragments to concatenate
			if deltaToolCall.Function.Arguments != "" {
				existingCall.Function.Arguments += deltaToolCall.Function.Arguments
			}
		} else {
			// First chunk contains ID, type, and function name
			toolCallsMap[deltaToolCall.Index] = &openai.ChatCompletionMessageToolCall{
				ID:   deltaToolCall.ID,
				Type: constant.Function("function"),
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      deltaToolCall.Function.Name,
					Arguments: deltaToolCall.Function.Arguments,
				},
			}
		}
	}

	if choice.FinishReason != "" {
		(*fullResponse).Choices[0].FinishReason = choice.FinishReason
	}
}

func (op *OpenAIProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    op.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(op.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	client := op.createClient(ctx)
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var fullResponse *openai.ChatCompletion
	toolCallsMap := make(map[int64]*openai.ChatCompletionMessageToolCall)

	for stream.Next() {
		chunk := stream.Current()
		if err := streamFunc(&chunk); err != nil {
			return nil, err
		}

		accumulateStreamChunk(&chunk, &fullResponse, toolCallsMap)
	}

	// Add accumulated tool calls to the response in index order
	if len(toolCallsMap) > 0 && fullResponse != nil && len(fullResponse.Choices) > 0 {
		logger := logf.FromContext(ctx)
		logger.V(1).Info("Accumulated tool calls from streaming", "count", len(toolCallsMap))

		// Find max index to iterate in order
		maxIndex := int64(-1)
		for idx := range toolCallsMap {
			if idx > maxIndex {
				maxIndex = idx
			}
		}

		// Build tool calls array in index order
		toolCalls := make([]openai.ChatCompletionMessageToolCall, 0, len(toolCallsMap))
		for i := int64(0); i <= maxIndex; i++ {
			if toolCall, exists := toolCallsMap[i]; exists {
				toolCalls = append(toolCalls, *toolCall)
				logger.V(1).Info("Adding tool call", "index", i, "id", toolCall.ID, "name", toolCall.Function.Name)
			}
		}
		fullResponse.Choices[0].Message.ToolCalls = toolCalls
		logger.V(1).Info("Set tool calls on response", "count", len(toolCalls))
	}

	if err := stream.Err(); err != nil {
		return nil, err
	}

	// Ensure we have a valid response
	if fullResponse == nil {
		return nil, fmt.Errorf("streaming completed but no response was accumulated")
	}

	// Initialize usage if not present (streaming responses may not include usage)
	if fullResponse.Usage.TotalTokens == 0 {
		fullResponse.Usage = openai.CompletionUsage{
			PromptTokens:     0,
			CompletionTokens: 0,
			TotalTokens:      0,
		}
	}

	return fullResponse, nil
}

func (op *OpenAIProvider) createClient(ctx context.Context) openai.Client {
	httpClient := common.NewHTTPClientWithLogging(ctx)

	return openai.NewClient(
		option.WithBaseURL(op.BaseURL),
		option.WithAPIKey(op.APIKey),
		option.WithHTTPClient(httpClient),
	)
}

func (op *OpenAIProvider) BuildConfig() map[string]any {
	config := map[string]any{
		"baseUrl": op.BaseURL,
	}
	if op.APIKey != "" {
		config["apiKey"] = op.APIKey
	}
	return config
}
