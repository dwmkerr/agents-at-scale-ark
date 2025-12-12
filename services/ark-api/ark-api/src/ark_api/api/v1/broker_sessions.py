"""Broker Sessions API - proxies to ark-cluster-memory broker service for OTEL trace sessions."""
import os
import logging
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broker/sessions", tags=["broker-sessions"])

BROKER_SERVICE_URL = os.getenv(
    "BROKER_SERVICE_URL",
    "http://ark-cluster-memory.default.svc.cluster.local"
)


async def proxy_get(path: str, params: Optional[dict] = None):
    url = f"{BROKER_SERVICE_URL}{path}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, params=params, timeout=30.0)
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            logger.error(f"Broker service error: {e}")
            raise HTTPException(status_code=503, detail="Broker service unavailable")


async def proxy_delete(path: str):
    url = f"{BROKER_SERVICE_URL}{path}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.delete(url, timeout=30.0)
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            logger.error(f"Broker service error: {e}")
            raise HTTPException(status_code=503, detail="Broker service unavailable")


async def stream_sessions(resource_version: Optional[str] = None):
    params = "watch=true"
    if resource_version:
        params += f"&resourceVersion={resource_version}"
    url = f"{BROKER_SERVICE_URL}/broker/sessions?{params}"
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream("GET", url, timeout=None) as resp:
                async for line in resp.aiter_lines():
                    yield f"{line}\n"
        except httpx.RequestError as e:
            logger.error(f"SSE stream error: {e}")
            yield f"event: error\ndata: {str(e)}\n\n"


async def stream_session(session_id: str, resource_version: Optional[str] = None):
    params = "watch=true"
    if resource_version:
        params += f"&resourceVersion={resource_version}"
    url = f"{BROKER_SERVICE_URL}/broker/sessions/{session_id}?{params}"
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream("GET", url, timeout=None) as resp:
                async for line in resp.aiter_lines():
                    yield f"{line}\n"
        except httpx.RequestError as e:
            logger.error(f"SSE stream error: {e}")
            yield f"event: error\ndata: {str(e)}\n\n"


@router.get("")
async def list_sessions(
    watch: bool = Query(False, description="Watch for real-time updates (SSE)"),
    resource_version: Optional[str] = Query(None, alias="resourceVersion"),
    limit: Optional[int] = Query(None),
    before: Optional[str] = Query(None),
    active: bool = Query(False)
):
    """List OTEL trace sessions. Use watch=true for SSE stream."""
    if watch:
        return StreamingResponse(
            stream_sessions(resource_version),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )

    params = {}
    if limit:
        params["limit"] = limit
    if before:
        params["before"] = before
    if active:
        params["active"] = "true"

    return await proxy_get("/broker/sessions", params if params else None)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    watch: bool = Query(False, description="Watch for real-time updates (SSE)"),
    resource_version: Optional[str] = Query(None, alias="resourceVersion")
):
    """Get a specific OTEL trace session by ID."""
    if watch:
        return StreamingResponse(
            stream_session(session_id, resource_version),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )
    return await proxy_get(f"/broker/sessions/{session_id}")


@router.delete("")
async def purge_sessions():
    """Purge all OTEL trace sessions."""
    return await proxy_delete("/broker/sessions")
