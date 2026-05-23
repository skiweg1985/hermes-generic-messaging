import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "./chatReducer";
import type { EventEnvelope } from "../../types/events";

const base = initialChatState("user@demo");

function ev(type: string, payload: Record<string, unknown>): EventEnvelope {
  return {
    schema_version: "v1",
    event_id: "e1",
    timestamp: "2026-05-23T10:00:00Z",
    platform: "custom_chat",
    chat_id: "c1",
    user_id: "u1",
    type,
    payload,
  };
}

describe("chatReducer", () => {
  it("shows user text", () => {
    const s = chatReducer(base, { type: "USER_TEXT", text: "hi" });
    expect(s.lines[0].kind).toBe("user");
    expect(s.lines[0].text).toBe("hi");
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
    expect(s.lines[0].text).toBe("Hello");
    expect(s.streamingMessageId).toBeNull();
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
    expect(s.lines[0].kind).toBe("error");
    expect(s.lines[0].text).toContain("RATE_LIMITED");
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
    expect(s.lines[0].kind).toBe("audio-out");
    expect(s.lines[0].audioUrl).toContain("example.local");
  });
});
