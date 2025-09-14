# DevSpace Templates for Python MCP Tools

This directory contains templates for setting up DevSpace development environment for Python MCP tools.

## Files

- `devspace-python-mcp.yaml` - DevSpace configuration for local development with hot-reload
- `Dockerfile.python-mcp` - Simple Dockerfile for Python MCP tools using uv
- `chart/` - Basic Helm chart for deploying the MCP tool

## Usage

These templates provide a starting point for:
1. Local development with DevSpace file sync and hot-reload
2. Building Docker images for Python MCP tools
3. Deploying to Kubernetes with Helm

## Customization Required

Replace the following placeholders:
- `mcp-tool` - Replace with your actual tool name
- `/app` - Adjust paths based on your project structure  
- Python module name in CMD/command sections