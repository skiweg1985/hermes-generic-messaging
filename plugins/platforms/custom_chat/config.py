"""Configuration and Event Schema v1 validation for custom_chat."""

from __future__ import annotations

import os
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

SCHEMA_VERSION = "v1"
PLATFORM_NAME = "custom_chat"

ERROR_CODES = frozenset(
    {
        "BAD_REQUEST",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "RATE_LIMITED",
        "UNSUPPORTED_MEDIA_TYPE",
        "PAYLOAD_TOO_LARGE",
        "STREAM_TIMEOUT",
        "INTERNAL_ERROR",
    }
)

INBOUND_TYPES = frozenset(
    {"message.create", "command.create", "audio.uploaded", "message.cancel"}
)
OUTBOUND_TYPES = frozenset(
    {
        "assistant_start",
        "assistant_delta",
        "assistant_done",
        "assistant_audio",
        "assistant_error",
    }
)


class CustomChatSettings(BaseModel):
    """Platform settings loaded from env and config extra."""

    enabled: bool = False
    ws_host: str = "127.0.0.1"
    ws_port: int = 8765
    bearer_token: str = ""
    max_audio_bytes: int = 10 * 1024 * 1024
    dedupe_ttl_seconds: int = 300
    rate_limit_per_minute: int = 60
    local_command_bypass: bool = False
    allowed_audio_mime_types: list[str] = Field(
        default_factory=lambda: [
            "audio/ogg",
            "audio/mpeg",
            "audio/wav",
            "audio/webm",
            "audio/mp4",
        ]
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
                os.getenv("CUSTOM_CHAT_MAX_AUDIO_BYTES", extra.get("max_audio_bytes", 10 * 1024 * 1024))
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
            local_command_bypass=bool(
                extra.get("local_command_bypass", False)
            ),
        )


class EventEnvelope(BaseModel):
    schema_version: Literal["v1"]
    event_id: str
    timestamp: str
    platform: Literal["custom_chat"]
    chat_id: str
    user_id: str
    thread_id: Optional[str] = None
    session_id: Optional[str] = None
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in INBOUND_TYPES and v not in OUTBOUND_TYPES:
            raise ValueError(f"unknown event type: {v}")
        return v


class MessageCreatePayload(BaseModel):
    message_id: str
    text: str
    idempotency_key: Optional[str] = None


class CommandCreatePayload(BaseModel):
    message_id: str
    command: str

    @field_validator("command")
    @classmethod
    def must_start_with_slash(cls, v: str) -> str:
        if not v.startswith("/"):
            raise ValueError("command must start with /")
        return v


class AudioUploadedPayload(BaseModel):
    message_id: str
    mime_type: str
    size_bytes: int
    url: Optional[str] = None
    file_ref: Optional[str] = None

    @model_validator(mode="after")
    def url_or_file_ref(self) -> "AudioUploadedPayload":
        if not self.url and not self.file_ref:
            raise ValueError("url or file_ref required")
        return self


class MessageCancelPayload(BaseModel):
    target_message_id: str


def parse_inbound_envelope(data: dict[str, Any]) -> EventEnvelope:
    return EventEnvelope.model_validate(data)


def build_outbound_event(
    *,
    event_id: str,
    timestamp: str,
    chat_id: str,
    user_id: str,
    event_type: str,
    payload: dict[str, Any],
    thread_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    if event_type not in OUTBOUND_TYPES:
        raise ValueError(f"not an outbound type: {event_type}")
    return {
        "schema_version": SCHEMA_VERSION,
        "event_id": event_id,
        "timestamp": timestamp,
        "platform": PLATFORM_NAME,
        "chat_id": chat_id,
        "user_id": user_id,
        "thread_id": thread_id,
        "session_id": session_id,
        "type": event_type,
        "payload": payload,
    }
