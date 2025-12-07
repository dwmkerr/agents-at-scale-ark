package main

import "time"

type Question struct {
	ID         string    `json:"id"`
	Sender     string    `json:"sender"`
	Recipient  string    `json:"recipient"`
	Channels   []string  `json:"channels"`
	Content    string    `json:"content"`
	Status     string    `json:"status"`
	Response   string    `json:"response,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	AnsweredAt time.Time `json:"answeredAt,omitempty"`
}

type AskQuestionRequest struct {
	Recipient string   `json:"recipient"`
	Content   string   `json:"content"`
	Channels  []string `json:"channels"`
}

type AskQuestionResponse struct {
	QuestionID string    `json:"questionId"`
	Response   string    `json:"response"`
	AnsweredAt time.Time `json:"answeredAt"`
}

type AnswerQuestionRequest struct {
	Response string `json:"response"`
}
