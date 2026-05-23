"""Platform settings for custom_chat."""

from __future__ import annotations

import os
from typing import Any, Optional

from pydantic import BaseModel, Field

from custom_chat_schema.schema import DEFAULT_ALLOWED_AUDIO_MIME_TYPES


class CustomChatSettings(BaseModel):
    enabled: bool = False
    ws_host: str = "127.0.0.1"
    ws_port: int = 8765
    bearer_token: str = ""
    max_audio_bytes: int = 10 * 1024 * 1024
    dedupe_ttl_seconds: int = 300
    rate_limit_per_minute: int = 60
    local_command_bypass: bool = False
    allowed_audio_mime_types: list[str] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_AUDIO_MIME_TYPES)
    )

    @classmethod
    def from_env_and_extra(cls, extra: Optional[dict[str, Any]] = None) -> "CustomChatSettings":
        extra = extra or {}
        return cls(
            enabled=bool(extra.get("enabled", False)),
            ws_host=os.getenv("CUSTOM_CHAT_WS_HOST", extra.get("ws_host", "127.0.0.1")),
            ws_port=int(os.getenv("CUSTOM_CHAT_WS_PORT", extra.get("ws_port", 8765))),
            bearer_token=os.getenv(
                "CUSTOM_CHAT_BEARER_TOKEN", extra.get("bearer_token", "")
            ),
            max_audio_bytes=int(
                os.getenv(
                    "CUSTOM_CHAT_MAX_AUDIO_BYTES",
                    extra.get("max_audio_bytes", 10 * 1024 * 1024),
                )
            ),
            dedupe_ttl_seconds=int(
                os.getenv(
                    "CUSTOM_CHAT_DEDUPE_TTL_SECONDS",
                    extra.get("dedupe_ttl_seconds", 300),
                )
            ),
            rate_limit_per_minute=int(
                os.getenv(
                    "CUSTOM_CHAT_RATE_LIMIT_PER_MINUTE",
                    extra.get("rate_limit_per_minute", 60),
                )
            ),
            local_command_bypass=bool(extra.get("local_command_bypass", False)),
        )
