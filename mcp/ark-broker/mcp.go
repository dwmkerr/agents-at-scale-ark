package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

type MCPServer struct {
	storage *Storage
}

func NewMCPServer(storage *Storage) *MCPServer {
	return &MCPServer{
		storage: storage,
	}
}

type MCPRequest struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type MCPResponse struct {
	Result interface{} `json:"result,omitempty"`
	Error  *MCPError   `json:"error,omitempty"`
}

type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type ProgressNotification struct {
	Progress int    `json:"progress"`
	Total    int    `json:"total"`
	Message  string `json:"message"`
}

func (m *MCPServer) HandleRequest(ctx context.Context, req MCPRequest, progressWriter io.Writer) MCPResponse {
	switch req.Method {
	case "ask_question":
		return m.handleAskQuestion(ctx, req.Params, progressWriter)
	case "list_pending_questions":
		return m.handleListPendingQuestions(req.Params)
	default:
		return MCPResponse{
			Error: &MCPError{
				Code:    -32601,
				Message: "Method not found",
			},
		}
	}
}

func (m *MCPServer) handleAskQuestion(ctx context.Context, params json.RawMessage, progressWriter io.Writer) MCPResponse {
	var askReq AskQuestionRequest
	if err := json.Unmarshal(params, &askReq); err != nil {
		return MCPResponse{
			Error: &MCPError{
				Code:    -32602,
				Message: "Invalid params",
			},
		}
	}

	question, err := m.storage.CreateQuestion("ark://agents/unknown", askReq.Recipient, askReq.Content, askReq.Channels)
	if err != nil {
		return MCPResponse{
			Error: &MCPError{
				Code:    -32603,
				Message: err.Error(),
			},
		}
	}

	m.sendProgress(progressWriter, ProgressNotification{
		Progress: 0,
		Total:    0,
		Message:  fmt.Sprintf("Question created: %s - waiting for response...", question.ID),
	})

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return MCPResponse{
				Error: &MCPError{
					Code:    -32000,
					Message: "Request cancelled",
				},
			}
		case <-ticker.C:
			q, err := m.storage.GetQuestion(question.ID)
			if err != nil {
				return MCPResponse{
					Error: &MCPError{
						Code:    -32603,
						Message: err.Error(),
					},
				}
			}

			if q.Status == "answered" {
				return MCPResponse{
					Result: AskQuestionResponse{
						QuestionID: q.ID,
						Response:   q.Response,
						AnsweredAt: q.AnsweredAt,
					},
				}
			}

			m.sendProgress(progressWriter, ProgressNotification{
				Progress: 0,
				Total:    0,
				Message:  "Still waiting for response...",
			})
		}
	}
}

func (m *MCPServer) handleListPendingQuestions(params json.RawMessage) MCPResponse {
	questions := m.storage.ListQuestions("pending")

	return MCPResponse{
		Result: map[string]interface{}{
			"questions": questions,
		},
	}
}

func (m *MCPServer) sendProgress(w io.Writer, progress ProgressNotification) {
	if w == nil {
		return
	}
	data, _ := json.Marshal(progress)
	fmt.Fprintf(w, "progress: %s\n", data)
}
