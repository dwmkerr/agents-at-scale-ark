package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
)

type AzureProvider struct {
	Model      string
	BaseURL    string
	APIVersion string
	APIKey     string
	Properties map[string]string
}

func (ap *AzureProvider) ChatCompletion(ctx context.Context, messages []Message, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := buildChatCompletionParams(ap.Model, messages, tools, ap.Properties, nil, "")

	client := ap.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

func (ap *AzureProvider) ChatCompletionWithSchema(ctx context.Context, messages []Message, outputSchema *runtime.RawExtension, schemaName string, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := buildChatCompletionParams(ap.Model, messages, tools, ap.Properties, outputSchema, schemaName)

	client := ap.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

func (ap *AzureProvider) createClient(ctx context.Context) openai.Client {
	httpClient := common.NewHTTPClientWithLogging(ctx)

	deploymentURL := fmt.Sprintf("%s/openai/deployments/%s", ap.BaseURL, ap.Model)
	return openai.NewClient(
		option.WithBaseURL(deploymentURL),
		option.WithHeader("api-key", ap.APIKey),
		option.WithAPIKey(ap.APIKey),
		option.WithHTTPClient(httpClient),
		option.WithQueryAdd("api-version", ap.APIVersion),
	)
}

func (ap *AzureProvider) BuildConfig() map[string]any {
	config := map[string]any{
		"baseUrl": ap.BaseURL,
	}
	if ap.APIVersion != "" {
		config["apiVersion"] = ap.APIVersion
	}
	if ap.APIKey != "" {
		config["apiKey"] = ap.APIKey
	}
	return config
}
