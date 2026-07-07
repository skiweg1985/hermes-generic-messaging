import { describe, expect, it } from "vitest";
import { buildNotificationContent, shouldNotify } from "./notifications";
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

describe("shouldNotify", () => {
  const ok = {
    supported: true,
    enabled: true,
    permission: "granted",
    backgrounded: true,
    eventType: "assistant_done",
  };

  it("notifies when everything lines up", () => {
    expect(shouldNotify(ok)).toBe(true);
  });

  it("each precondition vetoes independently", () => {
    expect(shouldNotify({ ...ok, supported: false })).toBe(false);
    expect(shouldNotify({ ...ok, enabled: false })).toBe(false);
    expect(shouldNotify({ ...ok, permission: "denied" })).toBe(false);
    expect(shouldNotify({ ...ok, permission: "default" })).toBe(false);
    expect(shouldNotify({ ...ok, backgrounded: false })).toBe(false);
  });

  it("only fires for visible-message events", () => {
    expect(shouldNotify({ ...ok, eventType: "assistant_delta" })).toBe(false);
    expect(shouldNotify({ ...ok, eventType: "typing" })).toBe(false);
    expect(shouldNotify({ ...ok, eventType: "assistant_error" })).toBe(true);
    expect(shouldNotify({ ...ok, eventType: "assistant_image" })).toBe(true);
  });
});

describe("buildNotificationContent", () => {
  it("uses the reply text as a one-line snippet, tagged by chat", () => {
    const content = buildNotificationContent(
      ev("assistant_done", { message_id: "r1", final_text: "Hello\n  world" }),
      base,
    );
    expect(content).toEqual({
      chatId: "c1",
      title: "one",
      body: "Hello world",
      tag: "c1",
    });
  });

  it("truncates long bodies to ~140 chars with an ellipsis", () => {
    const long = "x".repeat(200);
    const content = buildNotificationContent(
      ev("assistant_done", { message_id: "r1", final_text: long }),
      base,
    );
    expect(content?.body.length).toBeLessThanOrEqual(140);
    expect(content?.body.endsWith("…")).toBe(true);
  });

  it("skips interrupted replies without text", () => {
    expect(
      buildNotificationContent(
        ev("assistant_done", { message_id: "r1", final_text: "", interrupted: true }),
        base,
      ),
    ).toBeNull();
  });

  it("describes media events", () => {
    expect(
      buildNotificationContent(ev("assistant_image", { message_id: "r1", url: "http://x" }), base)
        ?.body,
    ).toBe("Sent an image");
    expect(
      buildNotificationContent(
        ev("assistant_file", { message_id: "r1", filename: "report.pdf" }),
        base,
      )?.body,
    ).toBe("Sent a file: report.pdf");
    expect(
      buildNotificationContent(ev("assistant_audio", { message_id: "r1" }), base)?.body,
    ).toBe("Sent an audio message");
  });

  it("describes errors and button prompts", () => {
    expect(
      buildNotificationContent(
        ev("assistant_error", { code: "UPSTREAM", message: "gateway down" }),
        base,
      )?.body,
    ).toBe("Error: gateway down");
    expect(
      buildNotificationContent(
        ev("assistant_buttons", { message_id: "b1", title: "Confirmation" }),
        base,
      )?.body,
    ).toBe("Confirmation");
  });

  it("returns null for non-message events", () => {
    expect(buildNotificationContent(ev("assistant_delta", { delta: "x" }), base)).toBeNull();
    expect(buildNotificationContent(ev("typing", {}), base)).toBeNull();
  });

  it("derives the title from the session's display title", () => {
    const state: ChatState = chatReducer(base, {
      type: "INBOUND_EVENT",
      event: ev("session_meta", { title: "Trip planning" }),
    });
    const content = buildNotificationContent(
      ev("assistant_done", { message_id: "r1", final_text: "ok" }),
      state,
    );
    expect(content?.title).toBe("Trip planning");
  });
});
