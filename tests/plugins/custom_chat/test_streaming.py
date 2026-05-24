"""PR3: streaming sequence and lifecycle tests."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.adapter import CustomChatAdapter
from plugins.platforms.custom_chat.streaming import StreamManager
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


def test_sequence_monotonicity():
    mgr = StreamManager()
    mgr.get_or_create("msg-1", chat_id="c", user_id="u")
    assert mgr.next_sequence("msg-1") == 1
    assert mgr.next_sequence("msg-1") == 2
    assert mgr.next_sequence("msg-1") == 3


@pytest.mark.asyncio
async def test_stream_lifecycle_start_delta_done(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-1"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_draft("c1", 1, "Hel", metadata={"reply_id": "stream-1"})
    await adapter.send_draft("c1", 1, "Hello", metadata={"reply_id": "stream-1"})
    await adapter.send("c1", "Hello world", metadata={"reply_id": "stream-1"})

    events = parse_sent_events(ws)
    types = [e["type"] for e in events]
    assert types.count("assistant_start") == 1
    deltas = [e for e in events if e["type"] == "assistant_delta"]
    assert len(deltas) == 2
    assert deltas[0]["payload"]["sequence"] == 1
    assert deltas[0]["payload"]["delta"] == "Hel"
    assert deltas[1]["payload"]["sequence"] == 2
    assert deltas[1]["payload"]["delta"] == "lo"
    assert any(e["type"] == "assistant_done" for e in events)


@pytest.mark.asyncio
async def test_incremental_delta_from_cumulative_draft(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-2"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_draft("c1", 1, "Hi", metadata={"reply_id": "stream-2"})
    await adapter.send_draft("c1", 1, "Hi there", metadata={"reply_id": "stream-2"})

    events = parse_sent_events(ws)
    deltas = [e["payload"]["delta"] for e in events if e["type"] == "assistant_delta"]
    assert deltas == ["Hi", " there"]


@pytest.mark.asyncio
async def test_segment_boundary_emits_assistant_segment(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-3"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_draft("c1", 1, "Before tool", metadata={"reply_id": "stream-3"})
    await adapter.send_draft(
        "c1",
        1,
        "",
        metadata={"reply_id": "stream-3", "tool_name": "read_file"},
    )
    await adapter.send_draft("c1", 1, "After tool", metadata={"reply_id": "stream-3"})

    events = parse_sent_events(ws)
    types = [e["type"] for e in events]
    assert "assistant_segment" in types
    segment = next(e for e in events if e["type"] == "assistant_segment")
    assert segment["payload"]["message_id"] == "stream-3"
    assert segment["payload"]["label"] == "🔧 read_file"
    assert segment["payload"]["segment_message_id"] == "stream-3-s1"


@pytest.mark.asyncio
async def test_reasoning_prepend_on_send(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-4"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send(
        "c1",
        "Final answer",
        metadata={"reply_id": "stream-4", "reasoning": "Thinking step by step."},
    )

    events = parse_sent_events(ws)
    done = next(e for e in events if e["type"] == "assistant_done")
    assert done["payload"]["reasoning_text"] == "Thinking step by step."
    assert done["payload"]["final_text"] == "Final answer"
    assert "💭 Reasoning:" not in done["payload"]["final_text"]


@pytest.mark.asyncio
async def test_reasoning_splits_streamed_thinking_from_final_answer(
    adapter: CustomChatAdapter, parse_sent_events
):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-4b"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    thinking = (
        "I think the user might be asking if I'm here, possibly with \"läuft?\" "
        "I don't need any tools for this."
    )
    await adapter.send(
        "c1",
        f"{thinking}\n\nJa, läuft – ich bin da.",
        metadata={
            "reply_id": "stream-4b",
            "reasoning": "**Reasoning:**\n**Responding simply**",
        },
    )

    events = parse_sent_events(ws)
    done = next(e for e in events if e["type"] == "assistant_done")
    assert "**Reasoning:**" in done["payload"]["reasoning_text"]
    assert thinking in done["payload"]["reasoning_text"]
    assert done["payload"]["final_text"] == "Ja, läuft – ich bin da."


@pytest.mark.asyncio
async def test_tool_progress_send_without_reply_id(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send("c1", '💻 terminal: "ls -la"')

    events = parse_sent_events(ws)
    assert result.success
    assert len(events) == 1
    assert events[0]["type"] == "assistant_notice"
    assert events[0]["payload"]["kind"] == "tool"
    assert "ls -la" in events[0]["payload"]["text"]
    assert events[0]["payload"]["message_id"] == result.message_id


@pytest.mark.asyncio
async def test_tool_progress_edit_message(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    first = await adapter.send("c1", '💻 terminal: "ls"')
    ws.sent.clear()
    result = await adapter.edit_message(
        "c1", first.message_id, '💻 terminal: "ls -la"\n🔍 read_file: "config.yaml"'
    )

    events = parse_sent_events(ws)
    assert result.success
    assert len(events) == 1
    assert events[0]["payload"]["message_id"] == first.message_id
    assert "read_file" in events[0]["payload"]["text"]


@pytest.mark.asyncio
async def test_final_answer_without_reply_id_not_tool_notice(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-final"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_draft("c1", 1, "partial", metadata={"reply_id": "stream-final"})
    ws.sent.clear()
    await adapter.send("c1", "Here is the final answer in plain prose.")

    events = parse_sent_events(ws)
    assert any(e["type"] == "assistant_done" for e in events)
    assert not any(e["type"] == "assistant_notice" for e in events)
    done = next(e for e in events if e["type"] == "assistant_done")
    assert "final answer" in done["payload"]["final_text"]


@pytest.mark.asyncio
async def test_edit_message_rejects_non_tool_content(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.edit_message("c1", "unknown-id", "Plain final answer text.")
    assert result.success is False
    assert parse_sent_events(ws) == []


@pytest.mark.asyncio
async def test_tool_status_routes_to_notice(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-5"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send(
        "c1",
        "Running read_file…",
        metadata={"reply_id": "stream-5", "kind": "tool"},
    )

    events = parse_sent_events(ws)
    notice = next(e for e in events if e["type"] == "assistant_notice")
    assert notice["payload"]["kind"] == "tool"
    assert notice["payload"]["text"] == "Running read_file…"


@pytest.mark.asyncio
async def test_stream_failure_emits_error(adapter: CustomChatAdapter, parse_sent_events):
    ws = MockWebSocket()
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)

    await adapter._emit_error(
        chat_id="c1",
        user_id="u1",
        message_id="fail-1",
        code="STREAM_TIMEOUT",
        message="stream timed out",
        ws=ws,
    )
    events = parse_sent_events(ws)
    assert events[0]["type"] == "assistant_error"
    assert events[0]["payload"]["code"] == "STREAM_TIMEOUT"
