"""Network helpers for BFF public URL and Hermes target resolution."""

from __future__ import annotations

import os
import socket

DEFAULT_CUSTOM_CHAT_WS_PORT = 8765
DEFAULT_BFF_PUBLIC_PORT = 8000


def get_primary_ipv4() -> str | None:
    """Best-effort primary LAN IPv4 (stdlib only)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def resolve_custom_chat_ws_url(
    *,
    target: str | None,
    fallback_url: str,
    default_port: int = DEFAULT_CUSTOM_CHAT_WS_PORT,
) -> str:
    """Parse CUSTOM_CHAT_TARGET into a WebSocket URL."""
    if not target or not target.strip():
        return fallback_url.strip()
    raw = target.strip()
    if raw.startswith(("ws://", "wss://")):
        return raw
    if ":" in raw and not raw.startswith("["):
        host, port_str = raw.rsplit(":", 1)
        if port_str.isdigit():
            return f"ws://{host}:{port_str}"
    return f"ws://{raw}:{default_port}"


def resolve_public_media_base_url(
    *,
    explicit: str | None = None,
    public_host: str | None = None,
    public_port: int | None = None,
    bff_host: str | None = None,
) -> str:
    """Resolve the HTTP base URL published in media events and client.register."""
    if explicit and explicit.strip():
        return explicit.strip().rstrip("/")

    port = public_port if public_port is not None else int(
        os.getenv("WEB_PUBLIC_PORT", str(DEFAULT_BFF_PUBLIC_PORT))
    )
    host = (public_host or os.getenv("WEB_PUBLIC_HOST", "")).strip()
    if not host:
        bind_host = (bff_host or os.getenv("BFF_HOST", "127.0.0.1")).strip()
        if bind_host == "0.0.0.0":
            host = get_primary_ipv4() or "127.0.0.1"
        else:
            host = bind_host or "127.0.0.1"
    return f"http://{host}:{port}".rstrip("/")
