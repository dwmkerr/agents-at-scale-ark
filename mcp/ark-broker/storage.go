package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Storage struct {
	filepath  string
	questions map[string]*Question
	mu        sync.RWMutex
	listeners []chan *Question
}

func NewStorage(filepath string) (*Storage, error) {
	s := &Storage{
		filepath:  filepath,
		questions: make(map[string]*Question),
		listeners: make([]chan *Question, 0),
	}

	if err := s.load(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *Storage) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filepath)
	if err != nil {
		if os.IsNotExist(err) {
			return s.save()
		}
		return err
	}

	var questions []*Question
	if err := json.Unmarshal(data, &questions); err != nil {
		return err
	}

	for _, q := range questions {
		s.questions[q.ID] = q
	}

	return nil
}

func (s *Storage) save() error {
	questions := make([]*Question, 0, len(s.questions))
	for _, q := range s.questions {
		questions = append(questions, q)
	}

	data, err := json.MarshalIndent(questions, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filepath, data, 0644)
}

func (s *Storage) CreateQuestion(sender, recipient, content string, channels []string) (*Question, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	q := &Question{
		ID:        "q-" + uuid.New().String()[:8],
		Sender:    sender,
		Recipient: recipient,
		Channels:  channels,
		Content:   content,
		Status:    "pending",
		CreatedAt: time.Now(),
	}

	s.questions[q.ID] = q

	if err := s.save(); err != nil {
		return nil, err
	}

	s.notifyListeners(q)

	return q, nil
}

func (s *Storage) GetQuestion(id string) (*Question, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	q, ok := s.questions[id]
	if !ok {
		return nil, fmt.Errorf("question not found: %s", id)
	}

	return q, nil
}

func (s *Storage) ListQuestions(status string) []*Question {
	s.mu.RLock()
	defer s.mu.RUnlock()

	questions := make([]*Question, 0)
	for _, q := range s.questions {
		if status == "" || q.Status == status {
			questions = append(questions, q)
		}
	}

	return questions
}

func (s *Storage) AnswerQuestion(id, response string) (*Question, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	q, ok := s.questions[id]
	if !ok {
		return nil, fmt.Errorf("question not found: %s", id)
	}

	if q.Status != "pending" {
		return nil, fmt.Errorf("question already answered")
	}

	q.Status = "answered"
	q.Response = response
	q.AnsweredAt = time.Now()

	if err := s.save(); err != nil {
		return nil, err
	}

	s.notifyListeners(q)

	return q, nil
}

func (s *Storage) Subscribe() chan *Question {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch := make(chan *Question, 10)
	s.listeners = append(s.listeners, ch)
	return ch
}

func (s *Storage) Unsubscribe(ch chan *Question) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, listener := range s.listeners {
		if listener == ch {
			s.listeners = append(s.listeners[:i], s.listeners[i+1:]...)
			close(ch)
			break
		}
	}
}

func (s *Storage) notifyListeners(q *Question) {
	for _, listener := range s.listeners {
		select {
		case listener <- q:
		default:
		}
	}
}
