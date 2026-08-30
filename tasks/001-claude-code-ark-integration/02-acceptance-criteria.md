# Acceptance Criteria

## Trust

How can we build trust in this process and these learnings?

- Acceptance criteria with verification method for each
- Working prototype demonstrates end-to-end flow
- Architecture decisions documented with rationale

## Research Available

| Question | Answer | Artifact |
|----------|--------|----------|
| How does claude-code-agent implement A2A? | Express server with JSON-RPC, spawns Claude CLI | `99-research/claude-code-agent.md` |
| Can Claude Code send OTEL to Ark Broker? | Yes, via OTEL env vars to Broker's /v1/traces | `99-research/ark-broker-otel.md` |
| How are MCP servers configured? | Via `--mcp-config` flag or mounted config | `99-research/claude-code-agent.md` |

## Criteria

### Integration Architecture

| Criterion | Verification Method |
|-----------|---------------------|
| Claude Code agent can be deployed to Ark cluster | `helm install` succeeds, pod runs |
| A2A protocol allows message exchange with Claude Code | `curl` to A2A endpoint returns response |
| Session continuity works for multi-turn conversations | Send multiple messages, verify context maintained |

### Observability

| Criterion | Verification Method |
|-----------|---------------------|
| Claude Code OTEL spans reach Ark Broker | Query `/traces` API shows Claude spans |
| Spans include useful agent context (tool calls, etc.) | Inspect span attributes in broker response |

### Customization

| Criterion | Verification Method |
|-----------|---------------------|
| MCP servers can be configured via Helm values | Deploy with MCP config, verify server loads |
| Skills can be mounted into agent container | Deploy with skill, invoke skill via message |
| Multiple agent configurations can coexist | Deploy two agents with different configs, both work |

### Documentation

| Criterion | Verification Method |
|-----------|---------------------|
| Architecture diagram shows integration points | Visual review of diagram |
| Deployment steps documented | Follow steps, achieve working setup |
| Customization patterns documented | Follow patterns, achieve custom config |

## Out of Scope (Follow-on Tasks)

- Production security review and hardening
- Performance benchmarking and optimization
- Integration with Ark Dashboard UI
- Automated agent registration with Ark controller

## Definition of Done

1. Architecture document explains integration approach
2. Prototype demonstrates Claude Code responding via A2A
3. OTEL spans visible in Ark Broker
4. Documentation covers deployment and customization
5. All acceptance criteria verified with evidence
