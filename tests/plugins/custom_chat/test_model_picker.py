"""Interactive /model picker (Telegram parity via send_model_picker)."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


@pytest.mark.asyncio
async def test_send_model_picker_emits_provider_buttons(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    async def _on_selected(_chat_id: str, _model_id: str, _provider: str) -> str:
        return "Model switched."

    result = await adapter.send_model_picker(
        chat_id="c1",
        providers=[
            {
                "slug": "openrouter",
                "name": "OpenRouter",
                "models": ["gpt-4", "claude-3"],
                "total_models": 2,
                "is_current": True,
            }
        ],
        current_model="gpt-4",
        current_provider="openrouter",
        session_key="sess-1",
        on_model_selected=_on_selected,
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    payload = events[0]["payload"]
    assert payload["kind"] == "model_picker"
    button_ids = [button["id"] for button in payload["buttons"]]
    assert "mp:openrouter" in button_ids
    assert "mx" in button_ids
    assert "c1" in adapter._model_picker_state


@pytest.mark.asyncio
async def test_model_picker_provider_then_model_switch(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws
    calls: list[tuple[str, str, str]] = []

    async def _on_selected(chat_id: str, model_id: str, provider: str) -> str:
        calls.append((chat_id, model_id, provider))
        return f"Switched to {model_id}"

    await adapter.send_model_picker(
        chat_id="c1",
        providers=[
            {
                "slug": "openrouter",
                "name": "OpenRouter",
                "models": ["gpt-4", "claude-3"],
                "total_models": 2,
            }
        ],
        current_model="gpt-4",
        current_provider="openrouter",
        session_key="sess-1",
        on_model_selected=_on_selected,
    )
    pick_id = adapter._model_picker_state["c1"]["pick_id"]

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "button.click",
            {
                "message_id": pick_id,
                "confirm_id": pick_id,
                "button_id": "mp:openrouter",
                "choice": "mp:openrouter",
            },
            chat_id="c1",
            event_id="evt-mp-1",
        ),
    )
    events = parse_sent_events(ws)
    assert events[-1]["payload"]["kind"] == "model_picker"
    assert any(button["id"] == "mm:0" for button in events[-1]["payload"]["buttons"])

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "button.click",
            {
                "message_id": pick_id,
                "confirm_id": pick_id,
                "button_id": "mm:0",
                "choice": "mm:0",
            },
            chat_id="c1",
            event_id="evt-mp-2",
        ),
    )

    assert calls == [("c1", "gpt-4", "openrouter")]
    final_payload = parse_sent_events(ws)[-1]["payload"]
    assert final_payload["title"] == "Model switched"
    assert "Switched to gpt-4" in final_payload["body"]
    assert final_payload["buttons"] == []
    assert "c1" not in adapter._model_picker_state
