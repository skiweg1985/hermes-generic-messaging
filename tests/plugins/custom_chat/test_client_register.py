"""Web BFF client.register announces the public media API base URL."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread

import pytest

from plugins.platforms.custom_chat.config import CustomChatSettings
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


class _UploadHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        _ = self.rfile.read(length)
        body = json.dumps(
            {
                "file_id": "reg-abc",
                "url": "http://test.local/api/v1/media/reg-abc",
                "mime_type": "text/plain",
                "size_bytes": 5,
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        _ = format, args


@pytest.fixture
def upload_server():
    server = HTTPServer(("127.0.0.1", 0), _UploadHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield base
    server.shutdown()


@pytest.mark.asyncio
async def test_client_register_enables_media_upload_without_env(
    adapter, parse_sent_events, upload_server, tmp_path: Path
):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    adapter.settings = CustomChatSettings(
        enabled=True,
        ws_host="127.0.0.1",
        ws_port=18765,
        bearer_token="test-token",
        media_public_base_url="",
    )
    ws = MockWebSocket()
    await adapter._handle_client_register(
        ws,
        {
            "type": "client.register",
            "payload": {
                "public_media_base_url": upload_server,
                "client_kind": "web_bff",
            },
        },
    )
    local = tmp_path / "registered.pdf"
    local.write_bytes(b"%PDF-1.4")
    adapter._ws_by_chat["workspace:conv1"] = ws
    result = await adapter.send_file("workspace:conv1", str(local), local.name)
    assert result.success
    events = parse_sent_events(ws)
    file_event = next(e for e in events if e["type"] == "assistant_file")
    assert file_event["payload"]["url"] == "http://test.local/api/v1/media/reg-abc"


@pytest.mark.asyncio
async def test_client_register_prefers_registered_url_over_env(
    adapter, upload_server, tmp_path: Path
):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    adapter.settings = CustomChatSettings(
        enabled=True,
        ws_host="127.0.0.1",
        ws_port=18765,
        bearer_token="test-token",
        media_public_base_url="http://unused.local:8000",
    )
    ws = MockWebSocket()
    await adapter._handle_client_register(
        ws,
        {
            "type": "client.register",
            "payload": {
                "public_media_base_url": upload_server,
                "client_kind": "web_bff",
            },
        },
    )
    assert adapter._effective_media_base_url() == upload_server
