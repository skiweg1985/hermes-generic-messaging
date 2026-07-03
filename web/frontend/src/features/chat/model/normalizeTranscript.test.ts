import { describe, expect, it } from "vitest";
import type { TranscriptLine } from "../../../types/events";
import { groupMessages } from "./groupMessages";
import { normalizeTranscript } from "./normalizeTranscript";

function line(partial: Partial<TranscriptLine> & Pick<TranscriptLine, "id" | "kind">): TranscriptLine {
  return { text: "", ...partial };
}

describe("normalizeTranscript", () => {
  it("merges text and file in same user turn via turnMessageId", () => {
    const messages = normalizeTranscript([
      line({ id: "turn-1", kind: "user", text: "see this", turnMessageId: "turn-1" }),
      line({
        id: "att-1",
        kind: "upload",
        text: "[upload]",
        role: "user",
        turnMessageId: "turn-1",
        fileUrl: "https://example.local/a.pdf",
        fileName: "a.pdf",
        mimeType: "application/pdf",
      }),
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.parts.map((p) => p.type)).toEqual(["text", "file"]);
  });

  it("groups multiple uploaded files in one user message", () => {
    const messages = normalizeTranscript([
      line({ id: "turn-2", kind: "user", text: "files", turnMessageId: "turn-2" }),
      line({
        id: "f1",
        kind: "image",
        role: "user",
        text: "img",
        turnMessageId: "turn-2",
        imageUrl: "https://example.local/i.png",
        mimeType: "image/png",
      }),
      line({
        id: "f2",
        kind: "upload",
        role: "user",
        text: "[upload]",
        turnMessageId: "turn-2",
        fileUrl: "https://example.local/d.pdf",
        fileName: "d.pdf",
        mimeType: "application/pdf",
      }),
    ]);
    expect(messages[0]!.parts.filter((p) => p.type === "image")).toHaveLength(1);
    expect(messages[0]!.parts.filter((p) => p.type === "file")).toHaveLength(1);
  });

  it("maps image upload to image part", () => {
    const messages = normalizeTranscript([
      line({
        id: "img-1",
        kind: "image",
        role: "user",
        text: "photo",
        imageUrl: "https://example.local/p.jpg",
        mimeType: "image/jpeg",
      }),
    ]);
    expect(messages[0]!.parts[0]).toMatchObject({ type: "image", url: "https://example.local/p.jpg" });
  });

  it("maps audio upload to audio part", () => {
    const messages = normalizeTranscript([
      line({
        id: "aud-1",
        kind: "audio-out",
        role: "user",
        text: "user> [audio]",
        audioUrl: "https://example.local/v.webm",
        mimeType: "audio/webm",
      }),
    ]);
    expect(messages[0]!.parts[0]).toMatchObject({ type: "audio" });
  });

  it("does not expose assistant audio filenames as captions", () => {
    const messages = normalizeTranscript([
      line({
        id: "aud-a",
        kind: "audio-out",
        role: "assistant",
        text: "assistant> [audio] tts_20260703.mp3",
        audioUrl: "https://example.local/tts.mp3",
        fileName: "tts_20260703.mp3",
        mimeType: "audio/mpeg",
      }),
    ]);
    expect(messages[0]!.parts[0]).toMatchObject({ type: "audio" });
    expect(messages[0]!.parts[0]).not.toHaveProperty("caption");
  });

  it("maps assistant text, image, and file as separate messages", () => {
    const messages = normalizeTranscript([
      line({ id: "a1", kind: "assistant", text: "Here you go" }),
      line({
        id: "a2",
        kind: "image",
        role: "assistant",
        text: "",
        imageUrl: "https://example.local/out.png",
      }),
      line({
        id: "a3",
        kind: "file",
        role: "assistant",
        text: "file",
        fileUrl: "https://example.local/out.pdf",
        fileName: "out.pdf",
      }),
    ]);
    expect(messages).toHaveLength(3);
    expect(messages[0]!.parts[0]).toMatchObject({ type: "text", text: "Here you go" });
    expect(messages[1]!.parts[0]).toMatchObject({ type: "image" });
    expect(messages[2]!.parts[0]).toMatchObject({ type: "file" });
  });

  it("splits reasoning notice and final answer", () => {
    const messages = normalizeTranscript([
      line({
        id: "n1",
        kind: "notice",
        noticeKind: "reasoning",
        text: "Thinking step by step.",
      }),
      line({
        id: "a1",
        kind: "assistant",
        text: "Final answer",
        reasoningText: "Thinking step by step.",
      }),
    ]);
    const assistant = messages.find((m) => m.messageId === "a1");
    expect(assistant?.parts.map((p) => p.type)).toEqual(["reasoning", "text"]);
  });

  it("splits implicit TTS reasoning from assistant answer", () => {
    const messages = normalizeTranscript([
      line({
        id: "tts",
        kind: "assistant",
        text: "**Generating TTS** I need to create audio.\nHier ist deine Sprachi:",
      }),
    ]);
    expect(messages[0]!.parts.map((p) => p.type)).toEqual(["reasoning", "text"]);
    expect(messages[0]!.parts[1]).toMatchObject({ text: "Hier ist deine Sprachi:" });
  });

  it("splits fenced Hermes reasoning before assistant answer", () => {
    const messages = normalizeTranscript([
      line({
        id: "fenced-reasoning",
        kind: "assistant",
        text:
          "💭 **Reasoning:**\n```\n**Generating TTS**\n\nI need audio.\n```\n\nHier ist deine Sprachi:",
      }),
    ]);
    expect(messages[0]!.parts.map((p) => p.type)).toEqual(["reasoning", "text"]);
    expect(messages[0]!.parts[0]).toMatchObject({
      text: "**Generating TTS**\n\nI need audio.",
    });
    expect(messages[0]!.parts[1]).toMatchObject({ text: "Hier ist deine Sprachi:" });
  });

  it("maps structured tool notice to tool_call part", () => {
    const messages = normalizeTranscript([
      line({
        id: "t1",
        kind: "notice",
        noticeKind: "tool",
        text: "read_file: main.py",
        toolName: "read_file",
        toolStatus: "running",
        toolArgs: '{"path":"main.py"}',
      }),
    ]);
    expect(messages[0]!.parts[0]).toMatchObject({
      type: "tool_call",
      toolName: "read_file",
      status: "running",
    });
  });
});

describe("groupMessages", () => {
  it("groups user message with assistant outputs", () => {
    const messages = normalizeTranscript([
      line({ id: "u1", kind: "user", text: "hi" }),
      line({ id: "a1", kind: "assistant", text: "hello" }),
    ]);
    const turns = groupMessages(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.user?.parts[0]).toMatchObject({ type: "text", text: "hi" });
    expect(turns[0]!.outputs).toHaveLength(1);
  });
});
