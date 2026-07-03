from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.session_store import SessionStore

router = APIRouter(prefix="/api/v1", tags=["sessions"])


class SessionStatePayload(BaseModel):
    version: Literal[1] = 1
    activeChatId: str | None = None
    sessions: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/sessions")
async def get_sessions() -> dict[str, Any]:
    return SessionStore(get_settings()).load()


@router.put("/sessions")
async def put_sessions(payload: SessionStatePayload) -> dict[str, Any]:
    return SessionStore(get_settings()).save(payload.model_dump())
