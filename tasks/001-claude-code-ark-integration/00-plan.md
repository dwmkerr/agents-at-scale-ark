---
owner: ark-protocol-orchestrator
description: Integrate Claude Code with Ark via A2A protocol
---

# Claude Code Ark Integration - Plan

## Focus

Testing Claude Code A2A agents specifically via Ark's existing A2A support.

## Key Finding

**Ark already has native A2A support.** Zero code changes required.

A2A was chosen as the path of least resistance. Other methods exist (custom execution engine, direct integration) but A2A requires no Ark modifications.

## Tasks

- [x] Define objectives
- [x] Define acceptance criteria
- [x] Design architecture
- [x] Define verifiable prototype steps
- [ ] Execute prototype
- [ ] Document verification evidence
- [ ] Document outcome

## Prototype Steps

Sequential verification in `04-verifiable-prototype.md`:

1. **Hello World** - Install chart, query agent
2. **OTEL** - Verify telemetry flows to backend
3. **MCP** - Configure MCP servers via chart
4. **Skills** - Configure Claude skills/agents via chart

## Resources

Installation resources in `99-resources/`:
- `step1-install.sh` - Basic helm install
- `otel-configmap.yaml` - OTEL configuration
- `mcp-config.yaml` - MCP server configuration
- `skills-config.yaml` - Skills configuration

## Findings

Discoveries tracked in `99-findings/`:
- `01-visibility-enhancements.md` - Options for improving observability
- `02-otel-auto-injection.md` - Chart change for OTEL auto-injection

## Next Steps

1. Execute prototype steps sequentially
2. Collect verification evidence per step
3. Document outcome and learnings
