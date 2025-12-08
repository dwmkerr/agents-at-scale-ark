# Ark Broker - Objectives

## Overview

Ark Broker is a service extending ark-cluster-memory to handle asynchronous questions and responses between agents and users.

## Goals

1. **Async Agent-User Communication** - Enable agents to ask users for details or clarifications without blocking execution
2. **User-to-Agent Questions** - Allow users to send questions to agents and receive responses
3. **Channel Agnostic** - Support multiple communication channels through a unified interface

## Use Cases

- Agent requests clarification on ambiguous requirements
- Agent asks user to confirm before taking destructive action
- User sends follow-up question to a running or paused agent
- User provides additional context mid-execution
- Agent notifies user of completion or errors

## Supported Channels

- **GitHub Issues** - Questions posted as issue comments
- **Slack** - Messages in configured channels or DMs
- **Ark Dashboard** - In-app message interface
- **Programmatic API** - Direct REST/gRPC access for integrations

## Success Criteria

- Questions can be created, retrieved, and answered through any channel
- Agents can pause and resume based on pending questions
- Messages are persisted and queryable
- Channel adapters are pluggable without core changes
