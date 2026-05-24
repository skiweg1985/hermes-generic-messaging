"""Configuration and Event Schema v1 — re-exports from shared package."""

from custom_chat_schema import (
    ERROR_CODES,
    INBOUND_TYPES,
    OUTBOUND_TYPES,
    PLATFORM_NAME,
    SCHEMA_VERSION,
    AudioUploadedPayload,
    FileUploadedPayload,
    ButtonClickPayload,
    ButtonSpec,
    CommandCreatePayload,
    CustomChatSettings,
    EventEnvelope,
    MessageCancelPayload,
    MessageCreatePayload,
    build_outbound_event,
    parse_inbound_envelope,
)
from custom_chat_schema.schema import (
    DEFAULT_ALLOWED_AUDIO_MIME_TYPES,
    DEFAULT_ALLOWED_UPLOAD_MIME_TYPES,
)

__all__ = [
    "SCHEMA_VERSION",
    "PLATFORM_NAME",
    "ERROR_CODES",
    "INBOUND_TYPES",
    "OUTBOUND_TYPES",
    "DEFAULT_ALLOWED_AUDIO_MIME_TYPES",
    "DEFAULT_ALLOWED_UPLOAD_MIME_TYPES",
    "CustomChatSettings",
    "EventEnvelope",
    "MessageCreatePayload",
    "CommandCreatePayload",
    "AudioUploadedPayload",
    "FileUploadedPayload",
    "MessageCancelPayload",
    "ButtonClickPayload",
    "ButtonSpec",
    "parse_inbound_envelope",
    "build_outbound_event",
]
