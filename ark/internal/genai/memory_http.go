package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

// Simple message structure for fallback parsing
type simpleMessage struct {
	Role    string `json:"role"`
	Content string `json:"content,omitempty"`
}

// unmarshalMessageRobust tries discriminated union first, then falls back to simple role/content extraction
func unmarshalMessageRobust(rawJSON json.RawMessage) (openai.ChatCompletionMessageParamUnion, error) {
	// Step 1: Try discriminated union first (the normal case)
	var openaiMessage openai.ChatCompletionMessageParamUnion
	if err := json.Unmarshal(rawJSON, &openaiMessage); err == nil {
		return openaiMessage, nil
	}

	// Step 2: Fallback - try to extract role/content from simple format
	var simple simpleMessage
	if err := json.Unmarshal(rawJSON, &simple); err != nil {
		return openai.ChatCompletionMessageParamUnion{}, fmt.Errorf("malformed JSON: %v", err)
	}

	// Step 3: Validate role is present (any role is acceptable for future compatibility)
	if simple.Role == "" {
		return openai.ChatCompletionMessageParamUnion{}, fmt.Errorf("missing required 'role' field")
	}

	// Step 4: Convert simple format to proper OpenAI message based on known roles
	// For unknown roles, try user message as fallback (most permissive)
	switch simple.Role {
	case RoleUser:
		return openai.UserMessage(simple.Content), nil
	case RoleAssistant:
		return openai.AssistantMessage(simple.Content), nil
	case RoleSystem:
		return openai.SystemMessage(simple.Content), nil
	default:
		// Future-proof: accept any role by treating as user message
		// The OpenAI SDK will handle validation of the actual role
		return openai.UserMessage(simple.Content), nil
	}
}

type HTTPMemory struct {
	client     client.Client
	httpClient *http.Client
	baseURL    string
	sessionId  string
	name       string
	namespace  string
	recorder   EventEmitter

	// Persistent streaming connection
	streamWriter io.WriteCloser
	streamMutex  sync.Mutex
}

func NewHTTPMemory(ctx context.Context, k8sClient client.Client, memoryName, namespace string, recorder EventEmitter, config Config) (MemoryInterface, error) {
	if k8sClient == nil || memoryName == "" || namespace == "" {
		return nil, fmt.Errorf("invalid parameters")
	}

	memory, err := getMemoryResource(ctx, k8sClient, memoryName, namespace)
	if err != nil {
		return nil, err
	}

	// Use the lastResolvedAddress as our initial baseline
	if memory.Status.LastResolvedAddress == nil || *memory.Status.LastResolvedAddress == "" {
		return nil, fmt.Errorf("memory has no lastResolvedAddress in status")
	}

	sessionId := config.SessionId
	if sessionId == "" {
		sessionId = string(memory.UID)
	}

	httpClient := common.NewHTTPClientWithLogging(ctx)
	if config.Timeout > 0 {
		httpClient.Timeout = config.Timeout
	}

	return &HTTPMemory{
		client:     k8sClient,
		httpClient: httpClient,
		baseURL:    strings.TrimSuffix(*memory.Status.LastResolvedAddress, "/"),
		sessionId:  sessionId,
		name:       memoryName,
		namespace:  namespace,
		recorder:   recorder,
	}, nil
}

// resolveAndUpdateAddress dynamically resolves the memory address and updates the status if it changed
func (m *HTTPMemory) resolveAndUpdateAddress(ctx context.Context) error {
	memory, err := getMemoryResource(ctx, m.client, m.name, m.namespace)
	if err != nil {
		return fmt.Errorf("failed to get memory resource: %w", err)
	}

	// Resolve the address using ValueSourceResolver
	resolver := common.NewValueSourceResolver(m.client)
	resolvedAddress, err := resolver.ResolveValueSource(ctx, memory.Spec.Address, m.namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve memory address: %w", err)
	}

	// Check if address changed from current baseURL
	newBaseURL := strings.TrimSuffix(resolvedAddress, "/")
	if m.baseURL != newBaseURL {
		// Update the Memory status with new address
		memory.Status.LastResolvedAddress = &resolvedAddress
		memory.Status.Message = fmt.Sprintf("Address dynamically resolved to: %s", resolvedAddress)

		// Update the status in Kubernetes
		if err := m.client.Status().Update(ctx, memory); err != nil {
			// Log error but don't fail the request
			logCtx := logf.FromContext(ctx)
			logCtx.Error(err, "failed to update Memory status with new address",
				"memory", m.name, "namespace", m.namespace, "newAddress", resolvedAddress)
		}
	}

	// Update the baseURL
	m.baseURL = strings.TrimSuffix(resolvedAddress, "/")
	return nil
}

func (m *HTTPMemory) AddMessages(ctx context.Context, queryID string, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	// Resolve address dynamically
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return err
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryAddMessages", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
		"queryId":   queryID,
		"messages":  fmt.Sprintf("%d", len(messages)),
	})

	// Convert messages to the request format
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	reqBody, err := json.Marshal(MessagesRequest{
		SessionID: m.sessionId,
		QueryID:   queryID,
		Messages:  openaiMessages,
	})
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to serialize messages: %w", err))
		return fmt.Errorf("failed to serialize messages: %w", err)
	}

	requestURL := fmt.Sprintf("%s%s", m.baseURL, MessagesEndpoint)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(reqBody))
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to create request: %w", err))
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		tracker.Fail(fmt.Errorf("HTTP request failed: %w", err))
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		tracker.Fail(err)
		return err
	}

	tracker.Complete("messages added")
	return nil
}

func (m *HTTPMemory) GetMessages(ctx context.Context) ([]Message, error) {
	// Resolve address dynamically
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return nil, err
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryGetMessages", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
	})

	requestURL := fmt.Sprintf("%s%s?session_id=%s", m.baseURL, MessagesEndpoint, url.QueryEscape(m.sessionId))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to create request: %w", err))
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		tracker.Fail(fmt.Errorf("HTTP request failed: %w", err))
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP status %d", resp.StatusCode)
		tracker.Fail(err)
		return nil, err
	}

	var response MessagesResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		tracker.Fail(fmt.Errorf("failed to decode response: %w", err))
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	messages := make([]Message, 0, len(response.Messages))
	for i, record := range response.Messages {
		openaiMessage, err := unmarshalMessageRobust(record.Message)
		if err != nil {
			err := fmt.Errorf("failed to unmarshal message at index %d: %w", i, err)
			tracker.Fail(err)
			return nil, err
		}
		messages = append(messages, Message(openaiMessage))
	}

	// Update metadata with message count
	tracker.metadata["messages"] = fmt.Sprintf("%d", len(messages))
	tracker.Complete("retrieved")
	return messages, nil
}

func (m *HTTPMemory) NotifyCompletion(ctx context.Context) error {
	// Check if streaming is enabled via annotation
	streamingEnabled, err := m.isStreamingEnabled(ctx)
	if err != nil {
		logf.FromContext(ctx).V(1).Info("Failed to check streaming annotation", "error", err)
		return nil // Don't fail the operation
	}

	if !streamingEnabled {
		logf.FromContext(ctx).V(2).Info("Memory streaming disabled - skipping completion notification",
			"memory", fmt.Sprintf("%s/%s", m.namespace, m.name))
		return nil
	}

	logf.FromContext(ctx).V(1).Info("Memory streaming enabled - sending completion notification",
		"memory", fmt.Sprintf("%s/%s", m.namespace, m.name))

	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return err
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryNotifyCompletion", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
	})

	requestURL := fmt.Sprintf("%s"+CompletionEndpoint, m.baseURL, url.QueryEscape(m.sessionId))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, nil)
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to create request: %w", err))
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", ContentTypeJSON)
	req.Header.Set("User-Agent", UserAgent)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		tracker.Fail(fmt.Errorf("HTTP request failed: %w", err))
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.FromContext(ctx).V(1).Info("Error closing response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		tracker.Fail(fmt.Errorf("HTTP %d: completion notification failed", resp.StatusCode))
		return fmt.Errorf("HTTP %d: completion notification failed", resp.StatusCode)
	}

	tracker.Complete("completion notified")
	return nil
}

func (m *HTTPMemory) isStreamingEnabled(ctx context.Context) (bool, error) {
	var memory arkv1alpha1.Memory
	key := client.ObjectKey{Name: m.name, Namespace: m.namespace}

	if err := m.client.Get(ctx, key, &memory); err != nil {
		return false, fmt.Errorf("failed to get memory resource %s/%s: %w", m.namespace, m.name, err)
	}

	annotations := memory.GetAnnotations()
	if annotations == nil {
		return false, nil
	}

	enabled := annotations["ark.mckinsey.com/memory-event-stream-enabled"]
	return enabled == "true", nil
}

func (m *HTTPMemory) StreamChunk(ctx context.Context, chunk StreamChunk) error {
	m.streamMutex.Lock()
	defer m.streamMutex.Unlock()

	// Establish connection on first chunk
	if m.streamWriter == nil {
		if err := m.establishStreamConnection(ctx); err != nil {
			logf.FromContext(ctx).Error(err, "Failed to establish persistent stream connection", "sessionId", m.sessionId)
			return fmt.Errorf("failed to establish stream connection: %w", err)
		}
	}

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryStreamChunk", m.name, map[string]string{
		"namespace": m.namespace,
		"sessionId": m.sessionId,
	})

	// Convert StreamChunk to StreamResponse format expected by memory service
	streamResponse := map[string]interface{}{
		"id":      m.sessionId,
		"object":  "chat.completion.chunk",
		"created": time.Now().Unix(),
		"model":   "ark-streaming",
		"choices": []map[string]interface{}{{
			"index": 0,
			"delta": map[string]interface{}{
				"content": chunk.Content,
			},
		}},
	}

	// Add ARK metadata if provided
	if chunk.QueryTarget != "" || chunk.MessageTarget != "" {
		streamResponse["ark"] = map[string]interface{}{
			"query_target":   chunk.QueryTarget,
			"message_target": chunk.MessageTarget,
			"session_id":     m.sessionId,
		}
	}

	// Write chunk as newline-delimited JSON to persistent stream
	jsonData, err := json.Marshal(streamResponse)
	if err != nil {
		tracker.Fail(fmt.Errorf("failed to marshal stream chunk: %w", err))
		return fmt.Errorf("failed to marshal stream chunk: %w", err)
	}

	// Write JSON + newline to the stream
	if _, err := m.streamWriter.Write(append(jsonData, '\n')); err != nil {
		tracker.Fail(fmt.Errorf("failed to write stream chunk: %w", err))
		return fmt.Errorf("failed to write stream chunk: %w", err)
	}

	tracker.Complete("chunk streamed")
	return nil
}

// establishStreamConnection creates a persistent streaming connection to memory service
func (m *HTTPMemory) establishStreamConnection(ctx context.Context) error {
	if err := m.resolveAndUpdateAddress(ctx); err != nil {
		return err
	}

	// Create a pipe for streaming data
	pr, pw := io.Pipe()

	requestURL := fmt.Sprintf("%s/stream/%s", m.baseURL, url.QueryEscape(m.sessionId))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, pr)
	if err != nil {
		return fmt.Errorf("failed to create stream request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-ndjson") // Newline-delimited JSON
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Connection", "keep-alive")

	// Start the HTTP request in background goroutine
	go func() {
		defer func() {
			if closeErr := pr.Close(); closeErr != nil {
				logf.FromContext(ctx).V(1).Info("Error closing pipe reader", "error", closeErr)
			}
		}()
		resp, err := m.httpClient.Do(req)
		if err != nil {
			logf.FromContext(ctx).Error(err, "Failed to establish stream connection")
			return
		}
		defer func() {
			if closeErr := resp.Body.Close(); closeErr != nil {
				logf.FromContext(ctx).V(1).Info("Error closing response body", "error", closeErr)
			}
		}()

		// Read and discard response body (memory service will respond when done)
		if _, copyErr := io.Copy(io.Discard, resp.Body); copyErr != nil {
			logf.FromContext(ctx).V(1).Info("Error copying response body", "error", copyErr)
		}
		logf.FromContext(ctx).Info("Stream connection closed", "sessionId", m.sessionId)
	}()

	// Store the write end of the pipe
	m.streamWriter = pw

	logf.FromContext(ctx).Info("Established persistent streaming connection", "sessionId", m.sessionId)
	return nil
}

func (m *HTTPMemory) Close() error {
	m.streamMutex.Lock()
	defer m.streamMutex.Unlock()

	// Close streaming writer if it exists
	if m.streamWriter != nil {
		_ = m.streamWriter.Close() // Ignore error during cleanup
		m.streamWriter = nil
	}

	if m.httpClient != nil {
		m.httpClient.CloseIdleConnections()
	}
	return nil
}
