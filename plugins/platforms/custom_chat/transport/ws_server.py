"""WebSocket server for Event Schema v1."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable, Optional, Set

import websockets
from websockets.asyncio.server import Server, serve
from websockets.server import WebSocketServerProtocol

logger = logging.getLogger(__name__)

OnMessageCallback = Callable[[WebSocketServerProtocol, dict[str, Any]], Awaitable[None]]
AuthCallback = Callable[[WebSocketServerProtocol], bool]


class WebSocketHub:
    def __init__(
        self,
        host: str,
        port: int,
        *,
        on_message: OnMessageCallback,
        authenticate: Optional[AuthCallback] = None,
    ) -> None:
        self.host = host
        self.port = port
        self.on_message = on_message
        self.authenticate = authenticate
        self._server: Optional[Server] = None
        self._clients: Set[WebSocketServerProtocol] = set()
        self._client_context: dict[WebSocketServerProtocol, dict[str, str]] = {}

    @property
    def clients(self) -> Set[WebSocketServerProtocol]:
        return set(self._clients)

    def set_client_context(
        self,
        ws: WebSocketServerProtocol,
        *,
        chat_id: str,
        user_id: str,
    ) -> None:
        self._client_context[ws] = {"chat_id": chat_id, "user_id": user_id}

    def get_client_context(self, ws: WebSocketServerProtocol) -> dict[str, str]:
        return self._client_context.get(ws, {})

    async def start(self) -> None:
        self._server = await serve(
            self._handler,
            self.host,
            self.port,
        )
        logger.info("custom_chat WebSocket listening on %s:%s", self.host, self.port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        for ws in list(self._clients):
            await ws.close()
        self._clients.clear()
        self._client_context.clear()

    async def broadcast(
        self,
        event: dict[str, Any],
        *,
        chat_id: Optional[str] = None,
        all_clients: bool = False,
    ) -> None:
        data = json.dumps(event)
        for ws in list(self._clients):
            if not all_clients:
                ctx = self._client_context.get(ws, {})
                if chat_id and ctx.get("chat_id") != chat_id:
                    continue
            try:
                await ws.send(data)
            except Exception:
                logger.debug("failed to send to client", exc_info=True)

    async def send_to(self, ws: WebSocketServerProtocol, event: dict[str, Any]) -> None:
        await ws.send(json.dumps(event))

    def _check_auth(self, ws: WebSocketServerProtocol) -> bool:
        if self.authenticate is None:
            return True
        return self.authenticate(ws)

    async def _handler(self, ws: WebSocketServerProtocol) -> None:
        if not self._check_auth(ws):
            await ws.close(code=4401, reason="unauthorized")
            return
        self._clients.add(ws)
        try:
            async for raw in ws:
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    await self.on_message(ws, {"__parse_error__": True, "raw": raw})
                    continue
                if isinstance(data, dict):
                    await self.on_message(ws, data)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(ws)
            self._client_context.pop(ws, None)
