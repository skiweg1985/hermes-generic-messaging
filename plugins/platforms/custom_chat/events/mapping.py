"""Map Event Schema v1 inbound events to Hermes MessageEvent."""

from __future__ import annotations

from typing import Any, Optional

from ..config import EventEnvelope
from .schema import InboundEventError


def _hermes_types():
    try:
        from gateway.platforms.base import MessageEvent, MessageType
    except ImportError:
        return None, None
    return MessageEvent, MessageType


def _build_message_event(
    MessageEvent: Any,
    *,
    text: str,
    message_type: Any,
    source: Any,
    message_id: str,
    raw_message: Optional[dict] = None,
    media_urls: Optional[list[str]] = None,
    media_types: Optional[list[str]] = None,
) -> Any:
    """Construct a MessageEvent, tolerating older Hermes signatures."""
    kwargs: dict[str, Any] = {
        "text": text,
        "message_type": message_type,
        "source": source,
        "message_id": message_id,
    }
    if raw_message is not None:
        kwargs["raw_message"] = raw_message
    if media_urls is not None:
        kwargs["media_urls"] = media_urls
    if media_types is not None:
        kwargs["media_types"] = media_types
    try:
        return MessageEvent(**kwargs)
    except TypeError:
        # Fallback for test stubs / older signatures that lack the extra
        # fields. Drop optional keys and retry.
        for opt_key in ("raw_message", "media_urls", "media_types"):
            kwargs.pop(opt_key, None)
        return MessageEvent(**kwargs)


def _resolve_message_type(MessageType: Any, mime_type: str) -> Any:
    if mime_type.startswith("image/"):
        return getattr(MessageType, "PHOTO", getattr(MessageType, "IMAGE", MessageType.TEXT))
    if mime_type.startswith("audio/"):
        return getattr(MessageType, "VOICE", getattr(MessageType, "AUDIO", MessageType.TEXT))
    return getattr(MessageType, "DOCUMENT", MessageType.TEXT)


def inbound_to_message_event(
    envelope: EventEnvelope,
    payload_model: Any,
    source: Any,
    *,
    transcribed_text: Optional[str] = None,
) -> Any:
    MessageEvent, MessageType = _hermes_types()
    if MessageEvent is None:
        raise InboundEventError(
            "INTERNAL_ERROR",
            "hermes-agent not installed; MessageEvent unavailable",
        )

    if envelope.type == "message.create":
        return _build_message_event(
            MessageEvent,
            text=payload_model.text,
            message_type=MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
        )

    if envelope.type == "command.create":
        # Pass slash text through verbatim — the gateway runner detects the
        # leading slash itself, just like the Telegram adapter.
        return _build_message_event(
            MessageEvent,
            text=payload_model.command,
            message_type=MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
        )

    if envelope.type in {"audio.uploaded", "file.uploaded"}:
        mime_type = payload_model.mime_type
        is_audio = mime_type.startswith("audio/")
        filename = getattr(payload_model, "filename", None)
        media_url = payload_model.url or payload_model.file_ref
        if transcribed_text:
            text = transcribed_text
        else:
            label = f"[audio:{mime_type}]" if is_audio else f"[file:{mime_type}]"
            parts = [label]
            if filename:
                parts.append(filename)
            if media_url:
                parts.append(f"url={media_url}")
            text = " ".join(parts)
        media_urls = [media_url] if media_url else []
        media_types = [mime_type] if mime_type else []
        message_type = _resolve_message_type(MessageType, mime_type)
        raw_message = {
            "mime_type": mime_type,
            "size_bytes": payload_model.size_bytes,
        }
        if getattr(payload_model, "filename", None):
            raw_message["filename"] = payload_model.filename
        return _build_message_event(
            MessageEvent,
            text=text,
            message_type=message_type,
            source=source,
            message_id=payload_model.message_id,
            media_urls=media_urls,
            media_types=media_types,
            raw_message=raw_message,
        )

    raise InboundEventError("BAD_REQUEST", f"cannot map type {envelope.type}")
