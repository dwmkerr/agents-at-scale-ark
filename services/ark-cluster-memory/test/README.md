# ARK Cluster Memory Test

Tests the ark-cluster-memory service functionality including memory storage, retrieval, and streaming capabilities.

## What it tests
- Memory service deployment and readiness
- Message storage and retrieval via Memory API
- Session management and isolation
- Query integration with memory persistence
- Streaming support for real-time message delivery

## Running
```bash
chainsaw test --test-dir tests/ark-cluster-memory
```

Successful completion validates that the ark-cluster-memory service correctly stores and retrieves conversation history.