package genai

import (
	"context"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/telemetry"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type ChatCompletionProvider interface {
	ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
	ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
}

type ConfigProvider interface {
	BuildConfig() map[string]any
}

type Model struct {
	Model        string
	Type         string
	Properties   map[string]string
	Provider     ChatCompletionProvider
	OutputSchema *runtime.RawExtension
	SchemaName   string
}

func (m *Model) ChatCompletion(ctx context.Context, messages []Message, memory MemoryInterface, streamingEnabled bool, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	if m.Provider == nil {
		return nil, nil
	}

	// Create telemetry span for all model calls
	tracer := telemetry.NewTraceContext()
	spanType := "llm.chat_completion"
	if streamingEnabled && memory != nil {
		spanType = "llm.chat_completion_stream"
	}
	ctx, span := tracer.StartSpan(ctx, spanType)
	defer span.End()

	// Set input and model details
	otelMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		otelMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}
	telemetry.SetLLMCompletionInput(span, otelMessages)
	telemetry.AddModelDetails(span, m.Model, m.Type, telemetry.ExtractProviderFromType(m.Type), m.Properties)

	var response *openai.ChatCompletion
	var err error

	// Use streaming if enabled and memory interface is provided
	if streamingEnabled && memory != nil {
		logf.Log.Info("Using streaming mode for chat completion")
		response, err = m.Provider.ChatCompletionStream(ctx, messages, n, func(chunk *openai.ChatCompletionChunk) error {
			// Forward all chunks as-is to preserve tool calls, finish_reason, and other OpenAI fields
			return memory.StreamChunk(ctx, chunk)
		}, tools...)
		if response != nil && len(response.Choices) > 0 {
			logf.Log.Info("Streaming response received",
				"hasToolCalls", len(response.Choices[0].Message.ToolCalls) > 0,
				"toolCallCount", len(response.Choices[0].Message.ToolCalls),
				"finishReason", response.Choices[0].FinishReason)
		}
	} else {
		response, err = m.Provider.ChatCompletion(ctx, messages, n, tools...)
	}

	if err != nil {
		telemetry.RecordError(span, err)
		return nil, err
	}

	// Set output and token usage
	telemetry.SetLLMCompletionOutput(span, response)
	telemetry.AddLLMTokenUsage(span, response.Usage.PromptTokens, response.Usage.CompletionTokens, response.Usage.TotalTokens)
	telemetry.RecordSuccess(span)

	return response, nil
}
