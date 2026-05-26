from __future__ import annotations

from pathlib import Path
from urllib.error import URLError

import pytest

from plugins.platforms.custom_chat import adapter as adapter_module
from tests.conftest import PlatformConfig
from plugins.platforms.custom_chat.adapter import CustomChatAdapter
from plugins.platforms.custom_chat.config import CustomChatSettings
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


@pytest.fixture
def adapter() -> CustomChatAdapter:
    adapter = CustomChatAdapter(PlatformConfig(extra={"enabled": True}))
    adapter.settings = CustomChatSettings(
        enabled=True,
        ws_host="127.0.0.1",
        ws_port=18765,
        bearer_token="test-token",
    )
    return adapter


@pytest.mark.asyncio
async def test_message_create_text_and_image_materializes_local_media_path(
    adapter: CustomChatAdapter,
    monkeypatch: pytest.MonkeyPatch,
):
    received = []
    requested_urls: list[str] = []

    async def handler(event):
        received.append(event)

    class _Response:
        def __enter__(self) -> "_Response":
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            _ = exc_type, exc, tb

        def read(self) -> bytes:
            return b"\x89PNG\r\n\x1a\n"

    def fake_urlopen(request, timeout=0):
        requested_urls.append(request.full_url)
        assert timeout == 30
        return _Response()

    monkeypatch.setattr(adapter_module.urllib_request, "urlopen", fake_urlopen)
    adapter.settings.media_public_base_url = "http://bff.local:8000"
    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "message.create",
            {
                "message_id": "m-img-1",
                "text": "describe this image",
                "attachments": [
                    {
                        "attachment_id": "att-img-1",
                        "mime_type": "image/png",
                        "size_bytes": 8,
                        "url": "http://unused.example/api/v1/media/img-1",
                    }
                ],
            },
        ),
    )

    assert len(received) == 1
    assert received[0].text == "describe this image"
    assert len(received[0].media_urls) == 1
    assert requested_urls == ["http://bff.local:8000/api/v1/media/img-1"]
    media_path = Path(received[0].media_urls[0])
    assert media_path.is_file()
    assert media_path.read_bytes() == b"\x89PNG\r\n\x1a\n"


@pytest.mark.asyncio
async def test_message_create_unreachable_image_url_keeps_event_flow(
    adapter: CustomChatAdapter,
    monkeypatch: pytest.MonkeyPatch,
):
    received = []

    async def handler(event):
        received.append(event)

    def failing_urlopen(_request, timeout=0):
        _ = timeout
        raise URLError("connection refused")

    monkeypatch.setattr(adapter_module.urllib_request, "urlopen", failing_urlopen)
    adapter.settings.media_public_base_url = "http://bff.local:8000"
    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "message.create",
            {
                "message_id": "m-img-2",
                "text": "describe this image",
                "attachments": [
                    {
                        "attachment_id": "att-img-2",
                        "mime_type": "image/png",
                        "size_bytes": 8,
                        "url": "http://unused.example/api/v1/media/img-2",
                    }
                ],
            },
        ),
    )

    assert len(received) == 1
    assert received[0].text == "describe this image"
    assert received[0].media_urls == ["http://unused.example/api/v1/media/img-2"]
