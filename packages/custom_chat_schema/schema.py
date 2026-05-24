"""Event Schema v1 — envelope, payloads, builders."""

from __future__ import annotations

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
    {
        "message.create",
        "command.create",
        "audio.uploaded",
        "file.uploaded",
        "message.cancel",
        "button.click",
    }
)
OUTBOUND_TYPES = frozenset(
    {
        "assistant_start",
        "assistant_delta",
        "assistant_done",
        "assistant_segment",
        "assistant_audio",
        "assistant_error",
        "assistant_buttons",
        "assistant_notice",
        "assistant_image",
        "assistant_file",
        "session_meta",
        "typing",
    }
)

NOTICE_KINDS = frozenset({"info", "tool", "reasoning", "warning", "error"})

DEFAULT_ALLOWED_AUDIO_MIME_TYPES = [
    "audio/ogg",
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/mp4",
]
DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "audio/ogg",
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/mp4",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]


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


class FileUploadedPayload(BaseModel):
    message_id: str
    filename: str
    mime_type: str
    size_bytes: int
    url: Optional[str] = None
    file_ref: Optional[str] = None

    @model_validator(mode="after")
    def url_or_file_ref(self) -> "FileUploadedPayload":
        if not self.url and not self.file_ref:
            raise ValueError("url or file_ref required")
        return self


class MessageCancelPayload(BaseModel):
    target_message_id: str


class ButtonClickPayload(BaseModel):
    """User clicked an interactive button rendered by an outbound event."""

    message_id: str
    confirm_id: Optional[str] = None
    button_id: str
    choice: Optional[str] = None
    extra: dict[str, Any] = Field(default_factory=dict)


class ButtonSpec(BaseModel):
    """Single button in an `assistant_buttons` outbound event."""

    id: str
    label: str
    style: Literal["primary", "secondary", "danger"] = "secondary"


class SlashConfirmPayload(BaseModel):
    """Outbound ``assistant_buttons`` payload for slash-command approval."""

    message_id: str
    confirm_id: str
    title: str
    body: str
    kind: Literal["slash_confirm"] = "slash_confirm"
    buttons: list[ButtonSpec]


class AssistantSegmentPayload(BaseModel):
    """Outbound segment boundary within a single assistant turn (e.g. after a tool call)."""

    message_id: str
    segment_message_id: str
    label: Optional[str] = None


class AssistantNoticePayload(BaseModel):
    """Outbound system / tool / reasoning notice bubble."""

    message_id: str
    text: str
    kind: Literal["info", "tool", "reasoning", "warning", "error"] = "info"


class SlashPickPayload(BaseModel):
    """Outbound ``assistant_buttons`` payload for slash-command option menus."""

    message_id: str
    pick_id: str
    command: str
    title: str
    body: str
    kind: Literal["slash_pick"] = "slash_pick"
    buttons: list[ButtonSpec]

    @field_validator("command")
    @classmethod
    def must_start_with_slash(cls, v: str) -> str:
        if not v.startswith("/"):
            raise ValueError("command must start with /")
        return v


class SessionMetaPayload(BaseModel):
    """Outbound metadata for a Hermes session bound to a chat.

    Emitted by the plugin when Hermes assigns or updates a session title (e.g.
    via ``/title <name>`` or auto-title). The envelope carries ``chat_id``,
    ``session_id`` and ``thread_id`` so the client can route the update to the
    correct session.
    """

    title: Optional[str] = None
    extra: dict[str, Any] = Field(default_factory=dict)


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
