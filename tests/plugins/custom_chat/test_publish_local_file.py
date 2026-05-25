"""Outbound local file paths are published via the web BFF media API."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread

import pytest

from plugins.platforms.custom_chat.config import CustomChatSettings
from plugins.platforms.custom_chat.media import (
    extract_local_paths,
    is_local_reference,
    publish_local_file_sync,
    resolve_local_path,
    strip_local_paths,
)


class _UploadHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        _ = self.rfile.read(length)
        body = json.dumps(
            {
                "file_id": "abc",
                "url": "http://test.local/api/v1/media/abc",
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
def upload_server(tmp_path: Path):
    sample = tmp_path / "note.txt"
    sample.write_text("hello", encoding="utf-8")
    server = HTTPServer(("127.0.0.1", 0), _UploadHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield base, sample
    server.shutdown()


def test_is_local_reference():
    assert is_local_reference("/tmp/report.pdf")
    assert is_local_reference("file:///tmp/report.pdf")
    assert not is_local_reference("https://example.local/report.pdf")
    assert not is_local_reference("")


def test_resolve_local_path_file_uri(tmp_path: Path):
    path = tmp_path / "x.bin"
    path.write_bytes(b"\x00")
    assert resolve_local_path(f"file://{path}") == path


def test_extract_local_paths_from_prose(tmp_path: Path):
    img = tmp_path / "browser_screenshot_ac3d.png"
    img.write_bytes(b"\x89PNG\r\n")
    text = (
        "Klar, hier ist eins direkt im Chat:\n\n"
        f"🖼️ Image: {img}\n"
    )
    paths = extract_local_paths(text)
    assert paths == [img]
    cleaned = strip_local_paths(text, paths)
    assert "browser_screenshot" not in cleaned
    assert "Klar" in cleaned


def test_publish_local_file_sync(upload_server):
    base, path = upload_server
    result = publish_local_file_sync(path, base)
    assert result["url"] == "http://test.local/api/v1/media/abc"


@pytest.mark.asyncio
async def test_send_file_publishes_local_path(
    adapter, parse_sent_events, upload_server, tmp_path: Path
):
    from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
    from tests.plugins.custom_chat.conftest import MockWebSocket

    base, _ = upload_server
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    adapter.settings = CustomChatSettings(
        enabled=True,
        ws_host="127.0.0.1",
        ws_port=18765,
        bearer_token="test-token",
        media_public_base_url=base,
    )
    local = tmp_path / "out.pdf"
    local.write_bytes(b"%PDF-1.4")
    ws = MockWebSocket()
    adapter._ws_by_chat["workspace:conv1"] = ws
    result = await adapter.send_file("workspace:conv1", str(local), local.name)
    assert result.success
    events = parse_sent_events(ws)
    file_event = next(e for e in events if e["type"] == "assistant_file")
    assert file_event["payload"]["url"] == "http://test.local/api/v1/media/abc"


@pytest.mark.asyncio
async def test_send_embedded_image_path_emits_assistant_image(
    adapter, parse_sent_events, upload_server, tmp_path: Path
):
    from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
    from tests.plugins.custom_chat.conftest import MockWebSocket

    base, _ = upload_server
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    adapter.settings = CustomChatSettings(
        enabled=True,
        ws_host="127.0.0.1",
        ws_port=18765,
        bearer_token="test-token",
        media_public_base_url=base,
    )
    img = tmp_path / "shot.png"
    img.write_bytes(b"\x89PNG\r\n")
    ws = MockWebSocket()
    adapter._ws_by_chat["workspace:conv1"] = ws
    text = f"🖼️ Image: {img}"
    result = await adapter.send("workspace:conv1", text, metadata={"reply_id": "r-img"})
    assert result.success
    events = parse_sent_events(ws)
    types = [e["type"] for e in events]
    assert "assistant_image" in types
    assert "assistant_done" in types
    image_event = next(e for e in events if e["type"] == "assistant_image")
    assert image_event["payload"]["url"] == "http://test.local/api/v1/media/abc"
    done = next(e for e in events if e["type"] == "assistant_done")
    assert str(img) not in done["payload"]["final_text"]
