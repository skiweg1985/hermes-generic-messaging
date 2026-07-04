"""Connection diagnostics: BFF liveness plus an upstream reachability probe."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urlsplit

import websockets
from fastapi import APIRouter, Depends
from websockets.exceptions import ConnectionClosed, InvalidHandshake, WebSocketException

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["diagnostics"])

UPSTREAM_PROBE_TIMEOUT = 2.0
UPSTREAM_REJECT_WINDOW = 0.3
UNAUTHORIZED_CLOSE_CODE = 4401


def upstream_target(ws_url: str) -> str:
    """Return `host:port` for display. Never includes scheme, userinfo or token."""
    parts = urlsplit(ws_url)
    host = parts.hostname or ""
    if parts.port:
        return f"{host}:{parts.port}"
    return host


def _classify_close(exc: ConnectionClosed) -> tuple[str, str]:
    code = getattr(getattr(exc, "rcvd", None), "code", None)
    if code == UNAUTHORIZED_CLOSE_CODE:
        return "unauthorized", "upstream rejected credentials"
    return "closed", f"upstream closed (code {code})" if code else "upstream closed"


async def probe_upstream(settings: Settings) -> dict[str, Any]:
    """Attempt a short upstream WebSocket connect and classify the outcome."""
    headers: dict[str, str] = {}
    if settings.custom_chat_bearer_token:
        headers["Authorization"] = f"Bearer {settings.custom_chat_bearer_token}"

    result: dict[str, Any] = {"target": upstream_target(settings.custom_chat_ws_url)}
    try:
        async with websockets.connect(
            settings.custom_chat_ws_url,
            additional_headers=headers,
            open_timeout=UPSTREAM_PROBE_TIMEOUT,
            close_timeout=1.0,
        ) as upstream:
            # Give the server a brief window to reject (e.g. 4401 unauthorized).
            try:
                await asyncio.wait_for(upstream.recv(), timeout=UPSTREAM_REJECT_WINDOW)
            except asyncio.TimeoutError:
                pass  # Still open after the window: treat as healthy.
            except ConnectionClosed as exc:
                status, detail = _classify_close(exc)
                result["status"] = status
                result["error"] = detail
                return result
        result["status"] = "ok"
        return result
    except ConnectionClosed as exc:
        status, detail = _classify_close(exc)
        result["status"] = status
        result["error"] = detail
        return result
    except InvalidHandshake as exc:
        result["status"] = "error"
        result["error"] = f"handshake failed: {exc}"
        return result
    except (OSError, asyncio.TimeoutError) as exc:
        result["status"] = "unreachable"
        result["error"] = str(exc) or "connection refused/timeout"
        return result
    except WebSocketException as exc:
        result["status"] = "error"
        result["error"] = str(exc)
        return result


@router.get("/diagnostics")
async def diagnostics(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Report the connection chain: BFF liveness and the BFF->upstream leg."""
    upstream = await probe_upstream(settings)
    return {"bff": "ok", "upstream": upstream}
