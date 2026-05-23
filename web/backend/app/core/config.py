"""BFF settings from environment."""

from __future__ import annotations

import os
from functools import lru_cache

from custom_chat_schema.schema import DEFAULT_ALLOWED_AUDIO_MIME_TYPES
from pydantic import BaseModel, Field


class Settings(BaseModel):
    custom_chat_ws_url: str = "ws://127.0.0.1:8765"
    custom_chat_bearer_token: str = ""
    web_chat_id: str = "workspace:demo"
    web_user_id: str = "user-demo"
    media_upload_dir: str = "./data/uploads"
    max_audio_bytes: int = 10 * 1024 * 1024
    public_media_base_url: str = "http://127.0.0.1:8000"
    allowed_audio_mime_types: list[str] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_AUDIO_MIME_TYPES)
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]
    )


@lru_cache
def get_settings() -> Settings:
    origins = os.getenv("WEB_CORS_ORIGINS", "")
    cors = [o.strip() for o in origins.split(",") if o.strip()] or None
    return Settings(
        custom_chat_ws_url=os.getenv("CUSTOM_CHAT_WS_URL", "ws://127.0.0.1:8765"),
        custom_chat_bearer_token=os.getenv("CUSTOM_CHAT_BEARER_TOKEN", ""),
        web_chat_id=os.getenv("WEB_CHAT_ID", "workspace:demo"),
        web_user_id=os.getenv("WEB_USER_ID", "user-demo"),
        media_upload_dir=os.getenv("WEB_MEDIA_UPLOAD_DIR", "./data/uploads"),
        max_audio_bytes=int(os.getenv("WEB_MAX_AUDIO_BYTES", str(10 * 1024 * 1024))),
        public_media_base_url=os.getenv(
            "WEB_PUBLIC_MEDIA_BASE_URL", "http://127.0.0.1:8000"
        ).rstrip("/"),
        cors_origins=cors
        or [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
    )
