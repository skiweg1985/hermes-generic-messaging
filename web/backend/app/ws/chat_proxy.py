"""Bidirectional WebSocket proxy to custom_chat adapter."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import websockets
from fastapi import WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from app.core.config import Settings
from custom_chat_schema.schema import INBOUND_TYPES, PLATFORM_NAME, SCHEMA_VERSION

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_media_ref(ref: Any, settings: Settings) -> Any:
    if not isinstance(ref, str):
        return ref
    stripped = ref.strip()
    if not stripped:
        return ref
    parsed = urlparse(stripped)
    if parsed.scheme in {"http", "https", "file"}:
        return stripped
    if stripped.startswith("/api/v1/media/"):
        return urljoin(f"{settings.public_media_base_url.rstrip('/')}/", stripped.lstrip("/"))
    return ref


def _normalize_message_payload(
    payload: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    attachments = payload.get("attachments")
    if not isinstance(attachments, list):
        return payload

    normalized_payload = dict(payload)
    normalized_attachments: list[Any] = []
    for entry in attachments:
        if not isinstance(entry, dict):
            normalized_attachments.append(entry)
            continue
        attachment = dict(entry)
        normalized_url = _normalize_media_ref(attachment.get("url"), settings)
        normalized_file_ref = _normalize_media_ref(attachment.get("file_ref"), settings)
        if normalized_url is not None:
            attachment["url"] = normalized_url
        if normalized_file_ref is not None:
            attachment["file_ref"] = normalized_file_ref
        elif isinstance(normalized_url, str) and normalized_url:
            attachment["file_ref"] = normalized_url
        normalized_attachments.append(attachment)
    normalized_payload["attachments"] = normalized_attachments
    return normalized_payload


def enrich_inbound(data: dict[str, Any], settings: Settings) -> dict[str, Any]:
    out = dict(data)
    if out.get("type") not in INBOUND_TYPES:
        return out
    if out.get("type") == "client.register":
        return out
    out.setdefault("schema_version", SCHEMA_VERSION)
    out.setdefault("platform", PLATFORM_NAME)
    out.setdefault("chat_id", settings.web_chat_id)
    out.setdefault("user_id", settings.web_user_id)
    out.setdefault("timestamp", _now_iso())
    out.setdefault("event_id", str(uuid.uuid4()))
    if out.get("type") == "message.create" and isinstance(out.get("payload"), dict):
        out["payload"] = _normalize_message_payload(out["payload"], settings)
    return out


def build_client_register(settings: Settings) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "event_id": str(uuid.uuid4()),
        "timestamp": _now_iso(),
        "platform": PLATFORM_NAME,
        "chat_id": settings.web_chat_id,
        "user_id": settings.web_user_id,
        "type": "client.register",
        "payload": {
            "public_media_base_url": settings.public_media_base_url,
            "client_kind": "web_bff",
        },
    }


async def proxy_chat(client_ws: WebSocket, settings: Settings) -> None:
    await client_ws.accept()
    headers = {}
    if settings.custom_chat_bearer_token:
        headers["Authorization"] = f"Bearer {settings.custom_chat_bearer_token}"

    try:
        async with websockets.connect(
            settings.custom_chat_ws_url,
            additional_headers=headers,
        ) as upstream:
            await upstream.send(json.dumps(build_client_register(settings)))
            await _relay(client_ws, upstream, settings)
    except ConnectionClosed as exc:
        logger.warning("upstream closed: %s", exc)
        await client_ws.close(code=1011, reason="upstream closed")
    except OSError as exc:
        logger.warning("upstream connect failed: %s", exc)
        await client_ws.close(code=1011, reason="upstream unavailable")
    except WebSocketDisconnect:
        pass


async def _relay(
    client_ws: WebSocket,
    upstream: websockets.ClientConnection,
    settings: Settings,
) -> None:
    async def client_to_upstream() -> None:
        try:
            while True:
                raw = await client_ws.receive_text()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    await upstream.send(json.dumps(enrich_inbound(data, settings)))
        except WebSocketDisconnect:
            pass

    async def upstream_to_client() -> None:
        try:
            async for raw in upstream:
                await client_ws.send_text(raw)
        except ConnectionClosed as exc:
            logger.warning("upstream closed during relay: %s", exc)

    done, pending = await asyncio.wait(
        [
            asyncio.create_task(client_to_upstream()),
            asyncio.create_task(upstream_to_client()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()
    for task in done:
        _ = task.exception() if not task.cancelled() else None
