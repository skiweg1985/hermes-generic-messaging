import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PartRenderer } from "./PartRenderer";
import type { ChatMessage } from "./model/messageTypes";

function noop() {}

describe("PartRenderer", () => {
  it("marks user audio action surfaces as right-aligned", () => {
    const message: ChatMessage = {
      messageId: "turn-voice",
      role: "user",
      status: "done",
      metadata: { turnMessageId: "turn-voice", lineIds: ["voice-line"] },
      parts: [
        {
          type: "audio",
          url: "https://example.local/voice.mp4",
          mimeType: "audio/mp4",
          lineId: "voice-line",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PartRenderer
        message={message}
        alignRight={false}
        turnActive={false}
        onButtonClick={noop}
        onMessageAction={noop}
        onReplyLine={vi.fn()}
      />,
    );

    expect(html).toContain("message-action-surface-right");
    expect(html).toContain("audio-card-user");
    expect(html).toContain("audio-card-right");
  });
});
