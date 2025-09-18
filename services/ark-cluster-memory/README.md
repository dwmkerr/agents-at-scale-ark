# ARK Cluster Memory

In-memory Kafka-like message broker for ARK cluster communication.

## Quickstart
```bash
make help     # Show available commands
make build    # Build Docker image
make dev      # Run in development mode
```

## Notes
- Provides Kafka-compatible API with topics, partitions, and consumer groups
- All data stored in memory (ephemeral)
- Designed for cluster-internal messaging and event streaming