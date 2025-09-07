import logging
import time
import uuid
from typing import List, Optional

from ark_sdk import QueryV1alpha1Spec
from ark_sdk.models.query_v1alpha1 import QueryV1alpha1
from fastapi import APIRouter, HTTPException
from openai.types.chat import ChatCompletion
from openai.types import Model
from pydantic import BaseModel

from ark_sdk.client import with_ark_client
from ...utils.query_targets import parse_model_to_query_target
from ...utils.query_polling import poll_query_completion
from ...constants.annotations import STREAMING_ENABLED_ANNOTATION

router = APIRouter(prefix="/openai/v1", tags=["OpenAI"])
logger = logging.getLogger(__name__)

# Constants
TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _parse_timestamp(metadata: dict) -> int:
    """Parse creationTimestamp from metadata, returning current time if not found."""
    created_timestamp = metadata.get("creationTimestamp")
    return (
        int(time.mktime(time.strptime(created_timestamp, TIMESTAMP_FORMAT)))
        if created_timestamp
        else int(time.time())
    )


def _create_model_entry(resource_id: str, metadata: dict) -> Model:
    """Create a Model entry from resource metadata."""
    return Model(
        id=resource_id,
        object="model",
        created=_parse_timestamp(metadata),
        owned_by="ark",
    )


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: float = 1.0
    max_tokens: Optional[int] = None
    stream: bool = False


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest) -> ChatCompletion:
    model = request.model
    messages = request.messages

    logger.info(f"Received chat completion request for model: {model}")

    target = parse_model_to_query_target(model)
    input_text = "\n".join([f"{msg.role}: {msg.content}" for msg in messages])
    query_name = f"openai-query-{uuid.uuid4().hex[:8]}"

    # Handle streaming annotation
    metadata = {"name": query_name, "namespace": "default"}
    if request.stream:
        metadata["annotations"] = {
            STREAMING_ENABLED_ANNOTATION: "true"
        }

    # Create the QueryV1alpha1 object like the queries API does
    query_resource = QueryV1alpha1(
        metadata=metadata,
        spec=QueryV1alpha1Spec(input=input_text, targets=[target]),
    )

    logger.info(f"Creating query for {target.type}/{target.name}")

    try:
        async with with_ark_client("default", "v1alpha1") as ark_client:
            # Create the query using QueryV1alpha1 object like queries API
            await ark_client.queries.a_create(query_resource)
            logger.info(f"Created query: {query_name}")

            # Poll for completion using helper function
            return await poll_query_completion(
                ark_client, query_name, model, input_text
            )

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """List available models in OpenAI format, including ARK agents, teams, models, and tools."""
    models_list = []

    async with with_ark_client("default", "v1alpha1") as ark_client:
        # Get agents
        try:
            agents = await ark_client.agents.a_list()
            for agent in agents:
                name = agent.metadata["name"]
                models_list.append(_create_model_entry(f"agent/{name}", agent.metadata))
        except Exception as e:
            logger.error(f"Failed to list agents: {e}")

        # Get teams
        try:
            teams = await ark_client.teams.a_list()
            for team in teams:
                name = team.metadata["name"]
                models_list.append(_create_model_entry(f"team/{name}", team.metadata))
        except Exception as e:
            logger.error(f"Failed to list teams: {e}")

        # Get models
        try:
            models = await ark_client.models.a_list()
            for model in models:
                name = model.metadata["name"]
                models_list.append(_create_model_entry(f"model/{name}", model.metadata))
        except Exception as e:
            logger.error(f"Failed to list models: {e}")

        # Get tools
        try:
            tools = await ark_client.tools.a_list()
            for tool in tools:
                name = tool.metadata["name"]
                models_list.append(_create_model_entry(f"tool/{name}", tool.metadata))
        except Exception as e:
            logger.error(f"Failed to list tools: {e}")

    return {"object": "list", "data": models_list}
