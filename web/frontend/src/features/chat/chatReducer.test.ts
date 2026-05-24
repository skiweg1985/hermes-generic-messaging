import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "./chatReducer";
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
