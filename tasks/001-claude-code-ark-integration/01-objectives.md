# Task: claude-code-ark-integration

Initial request: "Orchestrate an exploration of how to integrate Claude Code with Ark for AI agent orchestration."

## Status
Phase: Prototype Execution

## Plan
- [x] 01-objectives - Define why and goals
- [x] 02-acceptance-criteria - Define "done" + verification methods
- [x] 03-architecture - Design solution
- [ ] 04-verifiable-prototype - Build with checkpoints
- [ ] 05-verification - Prove each criterion with evidence
- [ ] 06-outcome - Document learnings

## Initial Analysis

**A2A is the path of least resistance.** After analyzing Ark's architecture, A2A protocol integration requires zero core changes to Ark.

Alternative approaches exist (custom execution engine, direct integration) but A2A offers:
- No Ark code changes required
- Leverages existing A2AServer controller
- Standard protocol with auto-discovery
- Clean separation of concerns

We are focusing exclusively on A2A integration for this prototype.

## Why This Task Matters

Claude Code offers unique capabilities: deep codebase understanding, sophisticated file operations, git workflows, and Claude's advanced reasoning. Integrating via A2A enables Ark users to leverage these through the standard Ark API.

## Key Finding: Ark Already Has A2A Support

**Ark has native A2A (Agent-to-Agent) protocol support built in.** Zero code changes required.

### How It Works

1. **A2AServer CRD** - Ark has a custom resource for A2A servers
2. **Auto-discovery** - A2AServerReconciler discovers agents from `/.well-known/agent-card.json`
3. **Agent creation** - Automatically creates Agent CRDs with `executionEngine: a2a`
4. **OTEL injection** - Ark injects OTEL trace headers into A2A requests

## Goals

### Primary Goals

1. **Zero-Code Integration**: Use Ark's existing A2A support to orchestrate Claude Code agents
2. **Minimal Deployment**: Helm install claude-code-agent + A2AServer auto-creation
3. **Observability**: Route Claude Code OTEL telemetry to configured backend

### Secondary Goals

4. **MCP Configuration**: Enable MCP servers via Helm values
5. **Skills Configuration**: Enable Claude skills/agents via Helm values

### Non-Goals

- Modifying Ark's native Go loop
- Building new execution engines
- Implementing new A2A protocol features

## Key Code Locations

| Component | File |
|-----------|------|
| A2A execution engine | `ark/internal/genai/a2a_execution.go` |
| A2AServer controller | `ark/internal/controller/a2aserver_controller.go` |
| A2AServer CRD | `ark/api/v1prealpha1/a2aserver_types.go` |
