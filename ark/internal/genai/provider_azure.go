package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"mckinsey.com/ark/internal/common"
)

type AzureProvider struct {
	Model      string
	BaseURL    string
	APIVersion string
	APIKey     string
	Properties map[string]string
}

func (ap *AzureProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(ap.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	client := ap.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

func (ap *AzureProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(ap.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	client := ap.createClient(ctx)
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var fullResponse *openai.ChatCompletion
	for stream.Next() {
		chunk := stream.Current()
		if err := streamFunc(&chunk); err != nil {
			return nil, err
		}

		if fullResponse == nil {
			fullResponse = &openai.ChatCompletion{
				ID:      chunk.ID,
				Object:  "chat.completion",
				Created: chunk.Created,
				Model:   chunk.Model,
				Choices: []openai.ChatCompletionChoice{},
			}
		}

		if len(chunk.Choices) > 0 && len(fullResponse.Choices) == 0 {
			fullResponse.Choices = append(fullResponse.Choices, openai.ChatCompletionChoice{
				Index:   chunk.Choices[0].Index,
				Message: openai.ChatCompletionMessage{},
			})
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			fullResponse.Choices[0].Message.Content += chunk.Choices[0].Delta.Content
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].FinishReason != "" {
			fullResponse.Choices[0].FinishReason = chunk.Choices[0].FinishReason
		}
	}

	if err := stream.Err(); err != nil {
		return nil, err
	}

	return fullResponse, nil
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
