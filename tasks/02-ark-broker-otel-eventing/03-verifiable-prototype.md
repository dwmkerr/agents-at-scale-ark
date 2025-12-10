---
owner: ark-prototyper
description: Verifiable prototype for OTEL eventing
---

# Ark Broker OTEL Eventing - Verifiable Prototype

## Goal

Minimal end-to-end: controller emits OTEL spans → broker receives → dashboard displays live session tree.

## Scope

**In scope:**
- OTLP HTTP/JSON receiver in ark-cluster-memory
- Controller forking exporter
- Sessions API with `?watch=true`
- Dashboard sessions page with live tree (queries + tool calls)

**Out of scope:**
- gRPC, upstream forwarding, PVC persistence

## Checkpoint 1: End-to-End OTEL Eventing

**Goal:** Run a query, see spans appear live in dashboard sessions page.

### Broker (ark-cluster-memory)
- [x] `POST /v1/traces` - OTLP HTTP/JSON receiver
- [x] `GET /sessions` - list sessions
- [x] `GET /sessions/:id` - session with spans
- [x] `?watch=true` - SSE streaming with resourceVersion

### Controller
- [x] Forking exporter - sends to broker when `ARK_BROKER_OTLP_ENDPOINT` set
- [x] Existing OTEL flow unchanged

### Dashboard
- [x] `/sessions` page with live tree view
- [x] Sessions → queries → tool calls
- [x] Click to see span details

### Verify
1. Start devspace with broker endpoint configured
2. Open dashboard `/sessions`
3. Run query: `kubectl apply -f samples/queries/simple.yaml`
4. See session tree update live
5. Click tool call to see details

## Journal

### 2024-12-08: Initial Implementation

**Broker (ark-cluster-memory):**
- Created `session-store.ts` with OTLP span ingestion, session aggregation, and file persistence
- Created `routes/sessions.ts` with REST endpoints and SSE watch support
- Updated `server.ts` to mount sessions router

**Controller:**
- Created `forking_exporter.go` to send spans to multiple destinations
- Updated `provider.go` to fork spans to ark-broker when `ARK_BROKER_OTLP_ENDPOINT` is set

**Dashboard:**
- Created `lib/services/sessions.ts` with fetch and SSE watch functions
- Created `components/sections/sessions-section.tsx` with live tree view
- Created `/sessions` page
- Added "Sessions" to dashboard navigation
