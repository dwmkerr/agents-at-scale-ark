package genai

import (
	"context"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
)

type OpenAIProvider struct {
	Model      string
	BaseURL    string
	APIKey     string
	Properties map[string]string
}

func (op *OpenAIProvider) ChatCompletion(ctx context.Context, messages []Message, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := buildChatCompletionParams(op.Model, messages, tools, op.Properties, nil, "")

	client := op.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

func (op *OpenAIProvider) ChatCompletionWithSchema(ctx context.Context, messages []Message, outputSchema *runtime.RawExtension, schemaName string, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := buildChatCompletionParams(op.Model, messages, tools, op.Properties, outputSchema, schemaName)

	client := op.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
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
