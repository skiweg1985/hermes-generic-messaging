"""Interactive slash-confirm button flow (parity with Telegram adapter)."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


@pytest.mark.asyncio
async def test_send_slash_confirm_emits_buttons(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_slash_confirm(
        chat_id="c1",
        title="Reload MCP",
        message="This will invalidate the provider prompt cache.",
        session_key="sess-1",
        confirm_id="cf-1",
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "assistant_buttons"
    payload = ev["payload"]
    assert payload["confirm_id"] == "cf-1"
    assert payload["kind"] == "slash_confirm"
    button_ids = [b["id"] for b in payload["buttons"]]
    assert button_ids == ["once", "always", "cancel"]
    assert adapter._slash_confirm_state["cf-1"] == "sess-1"


@pytest.mark.asyncio
async def test_send_slash_confirm_gateway_approval_uses_approval_state(adapter):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_slash_confirm(
        chat_id="c1",
        title="Approve tool",
        message="Run dangerous action?",
        session_key="sess-approval",
        confirm_id="ap-1",
        metadata={"gateway_approval": True},
    )

    assert result.success is True
    assert adapter._approval_state["ap-1"] == "sess-approval"
    assert "ap-1" not in adapter._slash_confirm_state


@pytest.mark.asyncio
async def test_send_exec_approval_emits_picker_buttons(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_exec_approval(
        chat_id="c1",
        command="rm -rf /tmp/demo",
        session_key="sess-exec-approval",
        description="dangerous command",
    )

    assert result.success is True
    assert result.message_id is not None

    events = parse_sent_events(ws)
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "assistant_buttons"
    payload = ev["payload"]
    assert payload["confirm_id"] == result.message_id
    assert payload["kind"] == "slash_confirm"
    button_ids = [b["id"] for b in payload["buttons"]]
    assert button_ids == ["once", "session", "deny"]
    assert adapter._approval_state[str(result.message_id)] == "sess-exec-approval"


@pytest.mark.asyncio
async def test_button_click_resolves_slash_confirm(adapter):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    calls: list[tuple[str, str]] = []

    class _Runner:
        def _resolve_slash_confirm(self, confirm_id: str, choice: str) -> None:
            calls.append((confirm_id, choice))

    adapter._gateway_runner = _Runner()
    adapter._slash_confirm_state["cf-2"] = "sess-2"

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "button.click",
            {"message_id": "cf-2", "confirm_id": "cf-2", "button_id": "once", "choice": "once"},
            event_id="evt-button-1",
        ),
    )

    assert calls == [("cf-2", "once")]
    assert "cf-2" not in adapter._slash_confirm_state


@pytest.mark.asyncio
async def test_button_click_unknown_confirm_silently_ignored(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "button.click",
            {"message_id": "cf-unknown", "button_id": "once", "choice": "once"},
            event_id="evt-button-unknown",
        ),
    )

    assert parse_sent_events(ws) == []


@pytest.mark.asyncio
async def test_button_click_missing_choice_emits_error(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._slash_confirm_state["cf-3"] = "sess-3"

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "button.click",
            {"message_id": "cf-3", "confirm_id": "cf-3", "button_id": ""},
            event_id="evt-button-noop",
        ),
    )

    events = parse_sent_events(ws)
    error_events = [e for e in events if e["type"] == "assistant_error"]
    assert len(error_events) == 1
    assert error_events[0]["payload"]["code"] == "BAD_REQUEST"
    assert error_events[0]["payload"]["message"] == "button.click requires confirm_id and choice"


@pytest.mark.asyncio
async def test_button_click_missing_required_payload_emits_friendly_error(
    adapter, parse_sent_events
):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "button.click",
            {"message_id": "cf-4", "confirm_id": "cf-4"},
            event_id="evt-button-invalid",
        ),
    )

    events = parse_sent_events(ws)
    error_events = [e for e in events if e["type"] == "assistant_error"]
    assert len(error_events) == 1
    assert error_events[0]["payload"]["code"] == "BAD_REQUEST"
    assert (
        error_events[0]["payload"]["message"]
        == "button.click requires message_id and button_id; confirm_id and choice are optional"
    )
