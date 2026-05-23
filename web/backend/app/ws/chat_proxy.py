"""Bidirectional WebSocket proxy to custom_chat adapter."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import websockets
from fastapi import WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosed

from app.core.config import Settings
from custom_chat_schema.schema import INBOUND_TYPES, PLATFORM_NAME, SCHEMA_VERSION

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def enrich_inbound(data: dict[str, Any], settings: Settings) -> dict[str, Any]:
    out = dict(data)
    if out.get("type") not in INBOUND_TYPES:
        return out
    out.setdefault("schema_version", SCHEMA_VERSION)
    out.setdefault("platform", PLATFORM_NAME)
    out.setdefault("chat_id", settings.web_chat_id)
    out.setdefault("user_id", settings.web_user_id)
    out.setdefault("timestamp", _now_iso())
    out.setdefault("event_id", str(uuid.uuid4()))
    return out


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
        except ConnectionClosed:
            pass

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
