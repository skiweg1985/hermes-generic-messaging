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
    reply_to_message_id: Optional[str] = None,
    reply_to_text: Optional[str] = None,
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
    if reply_to_message_id:
        kwargs["reply_to_message_id"] = reply_to_message_id
    if reply_to_text:
        kwargs["reply_to_text"] = reply_to_text
    try:
        return MessageEvent(**kwargs)
    except TypeError:
        # Fallback for test stubs / older signatures that lack the extra
        # fields. Drop optional keys and retry.
        for opt_key in (
            "raw_message",
            "media_urls",
            "media_types",
            "reply_to_message_id",
            "reply_to_text",
        ):
            kwargs.pop(opt_key, None)
        return MessageEvent(**kwargs)


def _format_reply_context(
    *,
    text: str,
    reply_to_message_id: Optional[str] = None,
    reply_to_text: Optional[str] = None,
) -> str:
    """Embed reply context into MessageEvent.text so the agent always sees it.

    Hermes may ignore adapter-specific reply metadata, so custom_chat makes the
    quoted message explicit in the user-visible prompt while still passing the
    structured fields through when supported.
    """
    quoted = (reply_to_text or "").strip()
    if not quoted:
        return text
    body = text.strip()
    quote_lines = "\n".join(f"> {line}" for line in quoted.splitlines())
    header = "[Reply context]"
    if reply_to_message_id:
        header = f"{header} original_message_id={reply_to_message_id}"
    if not body:
        return f"{header}\n{quote_lines}\n\n[User message]\n"
    return f"{header}\n{quote_lines}\n\n[User message]\n{body}"


def _attachments_text_fallback(attachments: list[Any]) -> str:
    """Produce a Hermes-readable text for media-only `message.create` events.

    Mirrors the legacy `audio.uploaded` / `file.uploaded` text shape so agents
    that don't read `media_urls` still see the attachment in `MessageEvent.text`.
    """
    parts: list[str] = []
    for att in attachments:
        mime = str(att.mime_type)
        url = att.url or att.file_ref
        label = f"[audio:{mime}]" if mime.startswith("audio/") else f"[file:{mime}]"
        line = [label]
        filename = getattr(att, "filename", None)
        if filename:
            line.append(str(filename))
        if url:
            line.append(f"url={url}")
        parts.append(" ".join(line))
    return "\n".join(parts)


def _resolve_message_type(MessageType: Any, mime_type: str) -> Any:
    if mime_type.startswith("image/"):
        return getattr(MessageType, "PHOTO", getattr(MessageType, "IMAGE", MessageType.TEXT))
    if mime_type.startswith("audio/"):
        return getattr(MessageType, "VOICE", getattr(MessageType, "AUDIO", MessageType.TEXT))
    return getattr(MessageType, "DOCUMENT", MessageType.TEXT)


def _has_audio_media(media_types: list[str]) -> bool:
    return any(str(mime).startswith("audio/") for mime in media_types)


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
        attachments = getattr(payload_model, "attachments", None) or []
        media_urls: list[str] = []
        media_types: list[str] = []
        raw_message: Optional[dict] = None
        message_type = MessageType.TEXT
        if attachments:
            raw_message = {"attachments": []}
            for att in attachments:
                media_url = att.url or att.file_ref
                if media_url:
                    media_urls.append(str(media_url))
                    media_types.append(str(att.mime_type))
                if raw_message is not None:
                    raw_message["attachments"].append(
                        {
                            "attachment_id": att.attachment_id,
                            "mime_type": att.mime_type,
                            "size_bytes": att.size_bytes,
                            "filename": getattr(att, "filename", None),
                            "url": media_url,
                        }
                    )
            if media_types:
                message_type = _resolve_message_type(MessageType, media_types[0])
        text = payload_model.text or ""
        if not text.strip() and attachments:
            if transcribed_text:
                text = transcribed_text
            elif not _has_audio_media(media_types):
                text = _attachments_text_fallback(attachments)
        if transcribed_text and _has_audio_media(media_types):
            message_type = MessageType.TEXT
            media_urls = []
            media_types = []
        reply_to_message_id = getattr(payload_model, "reply_to_message_id", None)
        reply_to_text = getattr(payload_model, "reply_to_text", None)
        text = _format_reply_context(
            text=text,
            reply_to_message_id=reply_to_message_id,
            reply_to_text=reply_to_text,
        )
        return _build_message_event(
            MessageEvent,
            text=text,
            message_type=message_type,
            source=source,
            message_id=payload_model.message_id,
            media_urls=media_urls or None,
            media_types=media_types or None,
            raw_message=raw_message,
            reply_to_message_id=reply_to_message_id,
            reply_to_text=reply_to_text,
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
        elif is_audio:
            text = ""
        else:
            label = f"[file:{mime_type}]"
            parts = [label]
            if filename:
                parts.append(filename)
            if media_url:
                parts.append(f"url={media_url}")
            text = " ".join(parts)
        media_urls = [media_url] if media_url else []
        media_types = [mime_type] if mime_type else []
        message_type = _resolve_message_type(MessageType, mime_type)
        if transcribed_text and is_audio:
            message_type = MessageType.TEXT
            media_urls = []
            media_types = []
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
