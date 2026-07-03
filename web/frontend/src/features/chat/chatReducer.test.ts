import { describe, expect, it } from "vitest";
import {
  chatDisplayTitle,
  chatReducer,
  initialChatState,
  resolveCancelTargetId,
} from "./chatReducer";
import type { ChatState, EventEnvelope } from "../../types/events";

const base = initialChatState("c1", "one");

function ev(type: string, payload: Record<string, unknown>, chatId = "c1"): EventEnvelope {
  return {
    schema_version: "v1",
    event_id: "e1",
    timestamp: "2026-05-23T10:00:00Z",
    platform: "custom_chat",
    chat_id: chatId,
    user_id: "u1",
    type,
    payload,
  };
}

function session(state: ChatState, chatId = state.activeChatId) {
  return state.sessionsById[chatId];
}

describe("chatReducer", () => {
  it("shows user text in the active session", () => {
    const s = chatReducer(base, { type: "USER_TEXT", text: "hi" });
    expect(session(s).lines[0].kind).toBe("user");
    expect(session(s).lines[0].text).toBe("hi");
  });

  it("sets and clears a reply target", () => {
    let s = chatReducer(base, {
      type: "SET_REPLY_TARGET",
      target: {
        lineId: "l1",
        role: "assistant",
        label: "Hermes",
        preview: "Previous answer",
      },
    });
    expect(session(s).replyTarget?.lineId).toBe("l1");

    s = chatReducer(s, { type: "CLEAR_REPLY_TARGET" });
    expect(session(s).replyTarget).toBeUndefined();
  });

  it("clears reply target after sending user text", () => {
    let s = chatReducer(base, {
      type: "SET_REPLY_TARGET",
      target: {
        lineId: "l1",
        role: "assistant",
        label: "Hermes",
        preview: "Previous answer",
      },
    });
    s = chatReducer(s, { type: "USER_TEXT", text: "answering" });
    expect(session(s).replyTarget).toBeUndefined();
  });

  it("deletes a line locally and clears stale reply target", () => {
    let s = chatReducer(base, { type: "USER_TEXT", text: "remove me", turnMessageId: "u1" });
    s = chatReducer(s, {
      type: "SET_REPLY_TARGET",
      target: {
        lineId: "u1",
        role: "user",
        label: "You",
        preview: "remove me",
      },
    });
    s = chatReducer(s, { type: "DELETE_LINE_LOCAL", lineId: "u1" });
    expect(session(s).lines).toHaveLength(0);
    expect(session(s).replyTarget).toBeUndefined();
  });

  it("streams assistant deltas", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 1, delta: "He" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_done", { message_id: "r1", final_text: "Hello" }),
    });
    expect(session(s).lines[0].text).toBe("Hello");
    expect(session(s).streamingMessageId).toBeNull();
  });

  it("stores structured reasoning on assistant_done", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_done", {
        message_id: "r1",
        reasoning_text: "Thinking step by step.",
        final_text: "Hello",
      }),
    });
    expect(session(s).lines[0].reasoningText).toBe("Thinking step by step.");
    expect(session(s).lines[0].text).toBe("Hello");
  });

  it("marks interrupted assistant replies", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", delta: "partial" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_done", { message_id: "r1", final_text: "", interrupted: true }),
    });
    expect(session(s).lines[0].interrupted).toBe(true);
    expect(session(s).lines[0].text).toBe("partial");
    expect(session(s).streamingMessageId).toBeNull();
  });

  it("handles assistant_error", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_error", {
        message_id: "r1",
        code: "RATE_LIMITED",
        message: "slow down",
      }),
    });
    expect(session(s).lines[0].kind).toBe("error");
    expect(session(s).lines[0].text).toContain("RATE_LIMITED");
  });

  it("handles assistant_audio", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_audio", {
        message_id: "r1",
        mime_type: "audio/mpeg",
        url: "https://example.local/a.mp3",
      }),
    });
    expect(session(s).lines[0].kind).toBe("audio-out");
    expect(session(s).lines[0].audioUrl).toContain("example.local");
  });

  it("replaces a started audio turn with the assistant audio attachment", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r-audio", turn_message_id: "r-audio" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_audio", {
        message_id: "r-audio",
        mime_type: "audio/ogg",
        url: "https://example.local/a.ogg",
      }),
    });
    expect(session(s).lines).toHaveLength(1);
    expect(session(s).lines[0].kind).toBe("audio-out");
    expect(session(s).streamingMessageId).toBeNull();
  });

  it("handles assistant_file as inline media or link", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_file", {
        message_id: "f1",
        filename: "voice.webm",
        mime_type: "audio/webm",
        size_bytes: 22,
        url: "https://example.local/voice.webm",
      }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_file", {
        message_id: "f2",
        filename: "report.pdf",
        mime_type: "application/pdf",
        size_bytes: 220,
        url: "https://example.local/report.pdf",
      }),
    });
    expect(session(s).lines[0].kind).toBe("audio-out");
    expect(session(s).lines[1].kind).toBe("file");
  });

  it("renders uploaded user audio with player metadata", () => {
    const s = chatReducer(base, {
      type: "USER_UPLOAD",
      filename: "recording.webm",
      mime: "audio/webm",
      size: 1280,
      url: "https://example.local/recording.webm",
    });
    expect(session(s).lines[0].kind).toBe("audio-out");
    expect(session(s).lines[0].audioUrl).toContain("recording.webm");
  });

  it("renders recorded voice without exposing a filename", () => {
    const s = chatReducer(base, {
      type: "USER_VOICE",
      turnMessageId: "voice-turn",
      attachmentId: "voice-1",
      mime: "audio/webm",
      size: 1280,
      url: "https://example.local/voice-message.webm",
    });
    expect(session(s).lines[0]).toMatchObject({
      kind: "audio-out",
      role: "user",
      text: "user> [voice]",
      audioUrl: "https://example.local/voice-message.webm",
      turnMessageId: "voice-turn",
    });
    expect(session(s).lines[0].fileName).toBeUndefined();
  });

  it("upserts model_picker cards with the same message id", () => {
    const event = ev("assistant_buttons", {
      message_id: "pick-9",
      confirm_id: "pick-9",
      title: "Model Configuration",
      body: "Select a provider:",
      kind: "model_picker",
      buttons: [{ id: "mp:openrouter", label: "OpenRouter (2)", style: "secondary" }],
    });
    let s = chatReducer(base, { type: "INBOUND_EVENT", event });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: {
        ...event,
        payload: {
          ...event.payload,
          body: "Select a model:",
          buttons: [{ id: "mm:0", label: "gpt-4", style: "secondary" }],
        },
      },
    });
    const lines = session(s).lines.filter((line) => line.kind === "buttons");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toContain("Select a model");
    expect(lines[0]?.buttons?.[0]?.id).toBe("mm:0");
  });

  it("handles slash_pick buttons with commandBase", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_buttons", {
        message_id: "pick-1",
        pick_id: "pick-1",
        command: "/model",
        title: "Select model",
        body: "Choose a model.",
        kind: "slash_pick",
        buttons: [{ id: "gpt-4", label: "GPT-4", style: "primary" }],
      }),
    });
    const line = session(s).lines[0];
    expect(line.kind).toBe("buttons");
    expect(line.buttonKind).toBe("slash_pick");
    expect(line.commandBase).toBe("/model");
    expect(line.pickId).toBe("pick-1");
  });

  it("handles buttons and button click status", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_buttons", {
        message_id: "cf-1",
        confirm_id: "cf-1",
        title: "Reload MCP",
        body: "Approve?",
        buttons: [{ id: "once", label: "Approve Once", style: "primary" }],
      }),
    });
    s = chatReducer(s, {
      type: "BUTTON_CLICKED",
      chatId: "c1",
      lineId: "cf-1",
      buttonId: "once",
    });
    expect(session(s).lines[0].kind).toBe("buttons");
    expect(session(s).lines[0].clickedButtonId).toBe("once");
  });

  it("handles notice, image, and typing events", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", { message_id: "n1", kind: "info", text: "Provider switched" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_image", { message_id: "i1", url: "https://example.local/cat.png", caption: "cat" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("typing", { state: "start" }),
    });
    expect(session(s).lines.map((line) => line.kind)).toEqual(["notice", "image"]);
    expect(session(s).typing).toBe(true);
    expect(session(s).typingStartedAt).toBeTruthy();
  });

  it("clears stale typing without requiring a stop event", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("typing", { state: "start" }),
    });
    const startedAt = session(s).typingStartedAt;
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("typing", { state: "start" }),
    });
    expect(session(s).typingStartedAt).toBe(startedAt);

    s = chatReducer(s, { type: "CLEAR_TYPING", chatId: "c1" });
    expect(session(s).typing).toBe(false);
    expect(session(s).typingStartedAt).toBeUndefined();
  });

  it("ignores late typing after a completed answer until the next user turn", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_done", { message_id: "r1", final_text: "done" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("typing", { state: "start" }),
    });
    expect(session(s).typing).toBe(false);

    s = chatReducer(s, { type: "USER_TEXT", text: "next" });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("typing", { state: "start" }),
    });
    expect(session(s).typing).toBe(true);
  });

  it("routes unknown chat_id events into an auto-created unread session", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", { message_id: "n1", text: "hello from c2" }, "c2"),
    });
    expect(session(s, "c2").lines[0].text).toBe("hello from c2");
    expect(session(s, "c2").unread).toBe(true);
    expect(s.activeChatId).toBe("c1");
  });

  it("keeps parallel streams separated by chat_id", () => {
    let s = chatReducer(base, { type: "CREATE_CHAT", chatId: "c2", label: "two" });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "a1", delta: "one" }, "c1"),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "a2", delta: "two" }, "c2"),
    });
    expect(session(s, "c1").lines[0].text).toBe("one");
    expect(session(s, "c2").lines[0].text).toBe("two");
  });

  it("appends incremental assistant deltas", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 1, delta: "Hel" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 2, delta: "lo" }),
    });
    expect(session(s).lines[0].text).toBe("Hello");
  });

  it("keeps streamTurnId for cancel after assistant_segment", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "turn-1", turn_message_id: "turn-1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_segment", {
        message_id: "turn-1",
        segment_message_id: "turn-1-s1",
      }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", {
        message_id: "turn-1-s1",
        turn_message_id: "turn-1",
      }),
    });
    const active = session(s);
    expect(active.streamingMessageId).toBe("turn-1-s1");
    expect(active.streamTurnId).toBe("turn-1");
    expect(resolveCancelTargetId(active)).toBe("turn-1");
  });

  it("splits assistant turn on assistant_segment", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "turn-1", turn_message_id: "turn-1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "turn-1", delta: "Before" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_segment", {
        message_id: "turn-1",
        segment_message_id: "turn-1-s1",
        label: "🔧 read_file",
      }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", {
        message_id: "turn-1-s1",
        turn_message_id: "turn-1",
      }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "turn-1-s1", delta: "After" }),
    });
    const lines = session(s).lines;
    expect(lines[0].text).toBe("Before");
    expect(lines[0].streaming).toBe(false);
    expect(lines[1].title).toBe("🔧 read_file");
    expect(lines[1].text).toBe("After");
    expect(lines[1].streaming).toBe(true);
  });

  it("renders tool notices with notice kind", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "n1",
        kind: "tool",
        text: "Running read_file…",
      }),
    });
    expect(session(s).lines[0].kind).toBe("notice");
    expect(session(s).lines[0].noticeKind).toBe("tool");
  });

  it("stores hermes session title from session_meta event", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: {
        ...ev("session_meta", { title: "Refactor billing service" }),
        session_id: "sess-7",
        thread_id: "thread-3",
      },
    });
    expect(session(s).title).toBe("Refactor billing service");
    expect(session(s).sessionId).toBe("sess-7");
    expect(session(s).threadId).toBe("thread-3");
    expect(chatDisplayTitle(session(s))).toBe("Refactor billing service");

    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("session_meta", { title: "" }),
    });
    expect(session(s).title).toBe("Refactor billing service");
  });

  it("ignores duplicate assistant_delta sequence", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 1, delta: "Hel" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 1, delta: "lo" }),
    });
    expect(session(s).lines[0].text).toBe("Hel");
  });

  it("applies out-of-order assistant_delta when sequence arrives in order", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 2, delta: "lo" }),
    });
    expect(session(s).lines[0].text).toBe("");
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", sequence: 1, delta: "Hel" }),
    });
    expect(session(s).lines[0].text).toBe("Hello");
  });

  it("preserves partial text on interrupted assistant_done", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_start", { message_id: "r1" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_delta", { message_id: "r1", delta: "partial answer" }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_done", { message_id: "r1", final_text: "", interrupted: true }),
    });
    expect(session(s).lines[0].text).toBe("partial answer");
    expect(session(s).lines[0].interrupted).toBe(true);
  });

  it("stores structured tool fields on assistant_notice", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "p1",
        kind: "tool",
        text: "read_file: main.py",
        tool_name: "read_file",
        status: "success",
        duration_ms: 42,
      }),
    });
    expect(session(s).lines[0].toolName).toBe("read_file");
    expect(session(s).lines[0].toolStatus).toBe("success");
    expect(session(s).lines[0].toolDurationMs).toBe(42);
  });

  it("upserts structured tool status transitions without duplicates", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "p1",
        kind: "tool",
        text: "read_file: src/main.py",
        tool_name: "read_file",
        status: "starting",
        args: '{"path":"src/main.py"}',
      }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "p1",
        kind: "tool",
        text: "read_file: done",
        tool_name: "read_file",
        status: "completed",
        result: "ok",
        duration_ms: 51,
      }),
    });
    const lines = session(s).lines.filter((l) => l.kind === "notice");
    expect(lines).toHaveLength(1);
    expect(lines[0].toolStatus).toBe("success");
    expect(lines[0].toolResult).toBe("ok");
    expect(lines[0].toolDurationMs).toBe(51);
  });

  it("infers tool error status from structured error payload", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "p1",
        kind: "tool",
        text: "shell: command failed",
        tool_name: "shell",
        error: "exit 1",
      }),
    });
    expect(session(s).lines[0].toolStatus).toBe("error");
    expect(session(s).lines[0].toolError).toBe("exit 1");
  });

  it("creates USER_MESSAGE turn with text and attachments", () => {
    const s = chatReducer(base, {
      type: "USER_MESSAGE",
      turnMessageId: "turn-9",
      text: "see this",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "doc.pdf",
          mime: "application/pdf",
          size: 100,
          url: "https://example.local/doc.pdf",
        },
      ],
    });
    const lines = session(s).lines;
    expect(lines.filter((l) => l.turnMessageId === "turn-9")).toHaveLength(2);
    expect(lines.some((l) => l.kind === "user")).toBe(true);
    expect(lines.some((l) => l.kind === "upload")).toBe(true);
  });

  it("maps video mime to video line kind", () => {
    const s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_file", {
        message_id: "v1",
        filename: "clip.webm",
        mime_type: "video/webm",
        size_bytes: 900,
        url: "https://example.local/clip.webm",
      }),
    });
    expect(session(s).lines[0].kind).toBe("video");
    expect(session(s).lines[0].videoUrl).toContain("clip.webm");
  });

  it("upserts tool progress notices by message_id", () => {
    let s = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "p1",
        kind: "tool",
        text: "💻 ls",
      }),
    });
    s = chatReducer(s, {
      type: "INBOUND_EVENT",
      event: ev("assistant_notice", {
        message_id: "p1",
        kind: "tool",
        text: "💻 ls -la",
      }),
    });
    expect(session(s).lines.filter((l) => l.kind === "notice")).toHaveLength(1);
    expect(session(s).lines[0].text).toBe("💻 ls -la");
  });
});
