.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

.PHONY: test
test: ## Run tests with coverage
	go test ./... -coverprofile cover.out

.PHONY: lint
lint: ## Run linting
	@if ! command -v golangci-lint > /dev/null; then \
		echo "Installing golangci-lint..."; \
		go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest; \
	fi
	golangci-lint run

.PHONY: build
build: ## Build the service
	go build -o postgres-memory main.go

.PHONY: run
run: ## Run the service locally
	go run main.go

.PHONY: docker-build
docker-build: ## Build Docker image
	docker build -t postgres-memory:latest .

.PHONY: clean
clean: ## Clean build artifacts
	rm -f postgres-memory cover.out

.PHONY: install
install: docker-build ## Install to cluster
	./build.sh latest auto
	helm install postgres-memory ./chart --wait

.PHONY: uninstall
uninstall: ## Uninstall from cluster
	helm uninstall postgres-memory || true