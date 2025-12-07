package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
)

type APIServer struct {
	storage *Storage
	router  *mux.Router
}

func NewAPIServer(storage *Storage) *APIServer {
	server := &APIServer{
		storage: storage,
		router:  mux.NewRouter(),
	}

	server.router.HandleFunc("/questions", server.listQuestions).Methods("GET")
	server.router.HandleFunc("/questions/{id}", server.getQuestion).Methods("GET")
	server.router.HandleFunc("/questions/{id}", server.answerQuestion).Methods("PATCH")
	server.router.HandleFunc("/questions/events", server.streamQuestionEvents).Methods("GET")

	return server
}

func (s *APIServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	s.router.ServeHTTP(w, r)
}

func (s *APIServer) listQuestions(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	questions := s.storage.ListQuestions(status)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(questions)
}

func (s *APIServer) getQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	question, err := s.storage.GetQuestion(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(question)
}

func (s *APIServer) answerQuestion(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var req AnswerQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	question, err := s.storage.AnswerQuestion(id, req.Response)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(question)
}

func (s *APIServer) streamQuestionEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	ch := s.storage.Subscribe()
	defer s.storage.Unsubscribe(ch)

	for {
		select {
		case <-r.Context().Done():
			return
		case question := <-ch:
			data, err := json.Marshal(question)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}
