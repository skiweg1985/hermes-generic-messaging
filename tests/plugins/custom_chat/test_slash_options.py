"""Interactive slash-option pick menus (Telegram inline-keyboard parity)."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


@pytest.mark.asyncio
async def test_send_slash_options_emits_buttons(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_slash_options(
        chat_id="c1",
        command="/model",
        title="Select model",
        message="Choose a model for this session.",
        options=[
            {"id": "gpt-4", "label": "GPT-4", "style": "primary"},
            {"id": "claude-3", "label": "Claude 3"},
        ],
        pick_id="pick-1",
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "assistant_buttons"
    payload = ev["payload"]
    assert payload["pick_id"] == "pick-1"
    assert payload["command"] == "/model"
    assert payload["kind"] == "slash_pick"
    assert payload["title"] == "Select model"
    button_ids = [b["id"] for b in payload["buttons"]]
    assert button_ids == ["gpt-4", "claude-3"]


@pytest.mark.asyncio
async def test_send_slash_options_rejects_invalid_command(adapter):
    result = await adapter.send_slash_options(
        chat_id="c1",
        command="model",
        title="Select model",
        message="Choose a model.",
        options=[{"id": "gpt-4", "label": "GPT-4"}],
        pick_id="pick-2",
    )
    assert result.success is False
    assert "/" in (result.error or "")


@pytest.mark.asyncio
async def test_send_slash_options_rejects_empty_options(adapter):
    result = await adapter.send_slash_options(
        chat_id="c1",
        command="/model",
        title="Select model",
        message="Choose a model.",
        options=[],
        pick_id="pick-3",
    )
    assert result.success is False
