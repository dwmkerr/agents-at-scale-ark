package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func main() {
	dataDir := flag.String("data-dir", "/data", "Directory for questions.json storage")
	port := flag.String("port", "8080", "HTTP port for REST API")
	flag.Parse()

	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	questionsFile := filepath.Join(*dataDir, "questions.json")
	storage, err := NewStorage(questionsFile)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}

	apiServer := NewAPIServer(storage)
	mcpServer := NewMCPServer(storage)

	_ = mcpServer

	log.Printf("Starting ark-broker on port %s", *port)
	log.Printf("Questions storage: %s", questionsFile)
	log.Printf("REST API: http://localhost:%s/questions", *port)
	log.Printf("SSE Events: http://localhost:%s/questions/events", *port)

	if err := http.ListenAndServe(":"+*port, apiServer); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
