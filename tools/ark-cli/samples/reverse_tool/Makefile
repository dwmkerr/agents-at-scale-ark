.PHONY: help init dev clean

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

init: ## Install dependencies using uv
	uv sync

dev: ## Run the reverse_tool in development mode
	uv run python reverse_tool.py

clean: ## Clean up generated files
	rm -rf .venv __pycache__ *.pyc
