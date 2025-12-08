"""Questions API - proxies to ark-cluster-memory broker service."""
import os
import logging
from typing import Optional

from fastapi import APIRouter, Query, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/questions", tags=["questions"])

BROKER_SERVICE_URL = os.getenv(
    "BROKER_SERVICE_URL",
    "http://ark-cluster-memory.default.svc.cluster.local"
)


class QuestionCreate(BaseModel):
    sender: str
    recipient: str
    channels: list[str] = []
    content: str


class QuestionAnswer(BaseModel):
    response: str


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


async def proxy_post(path: str, data: dict):
    url = f"{BROKER_SERVICE_URL}{path}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=data, timeout=30.0)
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            logger.error(f"Broker service error: {e}")
            raise HTTPException(status_code=503, detail="Broker service unavailable")


async def proxy_patch(path: str, data: dict):
    url = f"{BROKER_SERVICE_URL}{path}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.patch(url, json=data, timeout=30.0)
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            logger.error(f"Broker service error: {e}")
            raise HTTPException(status_code=503, detail="Broker service unavailable")


async def stream_events():
    url = f"{BROKER_SERVICE_URL}/questions?watch=true"
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream("GET", url, timeout=None) as resp:
                async for line in resp.aiter_lines():
                    yield f"{line}\n"
        except httpx.RequestError as e:
            logger.error(f"SSE stream error: {e}")
            yield f"event: error\ndata: {str(e)}\n\n"


@router.get("")
async def list_questions(
    watch: bool = Query(False, description="Watch for real-time updates (SSE)"),
    sender: Optional[str] = Query(None),
    recipient: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """List questions, optionally filtered. Use watch=true for SSE stream."""
    if watch:
        return StreamingResponse(
            stream_events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )

    params = {}
    if sender:
        params["sender"] = sender
    if recipient:
        params["recipient"] = recipient
    if status:
        params["status"] = status

    return await proxy_get("/questions", params if params else None)


@router.get("/{question_id}")
async def get_question(question_id: str):
    """Get a specific question by ID."""
    return await proxy_get(f"/questions/{question_id}")


@router.post("")
async def create_question(question: QuestionCreate):
    """Create a new question."""
    return await proxy_post("/questions", question.model_dump())


@router.patch("/{question_id}")
async def answer_question(question_id: str, answer: QuestionAnswer):
    """Answer a question."""
    return await proxy_patch(f"/questions/{question_id}", answer.model_dump())
