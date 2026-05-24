"""Platform settings for custom_chat."""

from __future__ import annotations

import os
from typing import Any, Optional

from pydantic import BaseModel, Field

from custom_chat_schema.schema import DEFAULT_ALLOWED_UPLOAD_MIME_TYPES


class CustomChatSettings(BaseModel):
    enabled: bool = False
    ws_host: str = "127.0.0.1"
    ws_port: int = 8765
    bearer_token: str = ""
    media_public_base_url: str = ""
    max_upload_bytes: int = 20 * 1024 * 1024
    dedupe_ttl_seconds: int = 300
    rate_limit_per_minute: int = 60
    local_command_bypass: bool = False
    allowed_upload_mime_types: list[str] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_UPLOAD_MIME_TYPES)
    )

    @property
    def max_audio_bytes(self) -> int:
        return self.max_upload_bytes

    @property
    def allowed_audio_mime_types(self) -> list[str]:
        return [mime for mime in self.allowed_upload_mime_types if mime.startswith("audio/")]

    @classmethod
    def from_env_and_extra(cls, extra: Optional[dict[str, Any]] = None) -> "CustomChatSettings":
        extra = extra or {}
        allowed_upload_mime_types = extra.get("allowed_upload_mime_types")
        if allowed_upload_mime_types is None:
            raw_mimes = os.getenv("CUSTOM_CHAT_ALLOWED_UPLOAD_MIME_TYPES", "").strip()
            if raw_mimes:
                allowed_upload_mime_types = [
                    mime.strip() for mime in raw_mimes.split(",") if mime.strip()
                ]
        max_upload_bytes = int(
            os.getenv(
                "CUSTOM_CHAT_MAX_UPLOAD_BYTES",
                os.getenv(
                    "CUSTOM_CHAT_MAX_AUDIO_BYTES",
                    str(extra.get("max_upload_bytes", extra.get("max_audio_bytes", 20 * 1024 * 1024))),
                ),
            )
        )
        return cls(
            enabled=bool(extra.get("enabled", False)),
            ws_host=os.getenv("CUSTOM_CHAT_WS_HOST", extra.get("ws_host", "127.0.0.1")),
            ws_port=int(os.getenv("CUSTOM_CHAT_WS_PORT", extra.get("ws_port", 8765))),
            bearer_token=os.getenv(
                "CUSTOM_CHAT_BEARER_TOKEN", extra.get("bearer_token", "")
            ),
            media_public_base_url=os.getenv(
                "CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL",
                extra.get("media_public_base_url", ""),
            ).rstrip("/"),
            max_upload_bytes=max_upload_bytes,
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
            allowed_upload_mime_types=allowed_upload_mime_types
            or list(DEFAULT_ALLOWED_UPLOAD_MIME_TYPES),
        )
