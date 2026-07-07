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

  it("embeds the reply quote inside the user text bubble", () => {
    const message: ChatMessage = {
      messageId: "turn-reply",
      role: "user",
      status: "done",
      metadata: {
        turnMessageId: "turn-reply",
        lineIds: ["reply-line"],
        replyToLineId: "orig-line",
        replyToLabel: "Hermes",
        replyToPreview: "Original message text",
      },
      parts: [{ type: "text", text: "my answer", streaming: false }],
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

    // Quote lives inside the bubble, before the reply text.
    const bubbleIndex = html.indexOf("msg-user-bubble");
    const quoteIndex = html.indexOf("msg-quote");
    expect(quoteIndex).toBeGreaterThan(bubbleIndex);
    expect(quoteIndex).toBeLessThan(html.indexOf("my answer"));
    expect(html).toContain("Hermes");
    expect(html).toContain("Original message text");
    expect(html).not.toContain("msg-quote-standalone");
  });

  it("renders a standalone quote block above media-only replies", () => {
    const message: ChatMessage = {
      messageId: "turn-voice-reply",
      role: "user",
      status: "done",
      metadata: {
        turnMessageId: "turn-voice-reply",
        lineIds: ["voice-line"],
        replyToLineId: "orig-line",
        replyToLabel: "Hermes",
        replyToPreview: "Original message text",
      },
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

    expect(html).toContain("msg-quote-standalone");
    expect(html).toContain("Original message text");
  });

  it("renders multi-tool raw progress text as a visible activity timeline", () => {
    const message: ChatMessage = {
      messageId: "tool-turn",
      role: "assistant",
      status: "streaming",
      metadata: { turnMessageId: "tool-turn", lineIds: ["tool-line"] },
      parts: [
        {
          type: "tool_call",
          toolName: "search_files",
          status: "running",
          summary: '"package.json"',
          rawText: [
            '🔍 search_files: "package.json"',
            "💻 terminal",
            "```",
            "npm run build -- --verbose",
            "```",
            '📖 read_file: "src/features/activity/ActivityCard.tsx"',
          ].join("\n"),
          lineId: "tool-line",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <PartRenderer
        message={message}
        alignRight={false}
        turnActive={true}
        onButtonClick={noop}
        onMessageAction={noop}
        onReplyLine={vi.fn()}
      />,
    );

    expect(html).toContain("activity-timeline-entry");
    expect(html).toContain("search_files");
    expect(html).toContain("npm run build -- --verbose");
    expect(html).toContain("ActivityCard.tsx");
  });
});
