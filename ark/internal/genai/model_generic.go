package genai

import (
	"context"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/telemetry"
)

type ChatCompletionProvider interface {
	ChatCompletion(ctx context.Context, messages []Message, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
	ChatCompletionWithSchema(ctx context.Context, messages []Message, outputSchema *runtime.RawExtension, schemaName string, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
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

func (m *Model) ChatCompletion(ctx context.Context, messages []Message, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	if m.Provider == nil {
		return nil, nil
	}

	// Create telemetry span for all model calls
	tracer := telemetry.NewTraceContext()
	ctx, span := tracer.StartSpan(ctx, "llm.chat_completion")
	defer span.End()

	// Set input and model details
	otelMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		otelMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}
	telemetry.SetLLMCompletionInput(span, otelMessages)
	telemetry.AddModelDetails(span, m.Model, m.Type, telemetry.ExtractProviderFromType(m.Type), m.Properties)

	// Call the appropriate provider method based on schema presence
	var response *openai.ChatCompletion
	var err error
	if m.OutputSchema == nil {
		response, err = m.Provider.ChatCompletion(ctx, messages, tools)
	} else {
		response, err = m.Provider.ChatCompletionWithSchema(ctx, messages, m.OutputSchema, m.SchemaName, tools)
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
