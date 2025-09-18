package genai

import (
	"encoding/json"
	"strconv"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
)

func applyPropertiesToParams(properties map[string]string, params *openai.ChatCompletionNewParams) {
	setDefaults := func() {
		params.Temperature = openai.Float(1.0)
		params.N = openai.Int(1)
	}

	if len(properties) == 0 {
		setDefaults()
		return
	}

	paramsJSON, err := json.Marshal(params)
	if err != nil {
		setDefaults()
		return
	}

	var paramsMap map[string]any
	if err := json.Unmarshal(paramsJSON, &paramsMap); err != nil {
		setDefaults()
		return
	}

	for key, value := range properties {
		if value == "" {
			continue
		}
		paramsMap[key] = value
	}

	if _, exists := properties["temperature"]; !exists {
		paramsMap["temperature"] = 1.0
	}
	if _, exists := properties["n"]; !exists {
		paramsMap["n"] = 1
	}

	updatedJSON, err := json.Marshal(paramsMap)
	if err != nil {
		return
	}

	_ = json.Unmarshal(updatedJSON, params)
}

// getFloatProperty extracts a float property with a default value
func getFloatProperty(properties map[string]string, key string, defaultValue float64) float64 {
	if value, exists := properties[key]; exists {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil {
			return parsed
		}
	}
	return defaultValue
}

// getIntProperty extracts an int property with a default value
func getIntProperty(properties map[string]string, key string, defaultValue int) int {
	if value, exists := properties[key]; exists {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

// buildResponseFormat creates a ResponseFormat from schema parameters
func buildResponseFormat(outputSchema *runtime.RawExtension, schemaName string) *openai.ChatCompletionNewParamsResponseFormatUnion {
	if outputSchema == nil {
		return nil
	}

	var schemaMap map[string]any
	if err := json.Unmarshal(outputSchema.Raw, &schemaMap); err != nil {
		return nil
	}

	return &openai.ChatCompletionNewParamsResponseFormatUnion{
		OfJSONSchema: &openai.ResponseFormatJSONSchemaParam{
			JSONSchema: openai.ResponseFormatJSONSchemaJSONSchemaParam{
				Name:   schemaName,
				Schema: schemaMap,
			},
		},
	}
}

// buildChatCompletionParams creates standard ChatCompletionNewParams from messages, tools, and properties
func buildChatCompletionParams(model string, messages []Message, tools []openai.ChatCompletionToolParam, properties map[string]string, outputSchema *runtime.RawExtension, schemaName string) openai.ChatCompletionNewParams {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    model,
		Messages: openaiMessages,
	}

	if len(tools) > 0 {
		params.Tools = tools
	}
	applyPropertiesToParams(properties, &params)

	if responseFormat := buildResponseFormat(outputSchema, schemaName); responseFormat != nil {
		params.ResponseFormat = *responseFormat
	}

	return params
}
