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

  it("keeps user voice transcripts as assistant output below the user voice", () => {
    const messages = normalizeTranscript([
      line({
        id: "voice-1",
        kind: "audio-out",
        role: "user",
        text: "user> [voice]",
        turnMessageId: "turn-voice",
        audioUrl: "https://example.local/voice.webm",
      }),
      line({
        id: "transcript-1",
        kind: "assistant",
        text: '🎙️ "Hast du einen Skill?"',
        turnMessageId: "transcript-1",
      }),
      line({ id: "a1", kind: "assistant", text: "Ja, habe ich." }),
    ]);
    const turns = groupMessages(messages);

    expect(messages).toHaveLength(3);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.user?.role).toBe("user");
    expect(turns[0]!.user?.parts.map((p) => p.type)).toEqual(["audio"]);
    expect(turns[0]!.outputs[0]!.parts[0]).toMatchObject({
      type: "text",
      text: '🎙️ "Hast du einen Skill?"',
    });
  });

  it("does not treat assistant turnMessageId=id lines as user anchors before user voice", () => {
    const messages = normalizeTranscript([
      line({
        id: "assistant-self-turn",
        kind: "assistant",
        text: "Assistant vorher",
        turnMessageId: "assistant-self-turn",
      }),
      line({
        id: "voice-line",
        kind: "audio-out",
        role: "user",
        text: "user> [voice]",
        turnMessageId: "voice-turn",
        audioUrl: "https://example.local/user.mp4",
        mimeType: "audio/mp4",
      }),
      line({ id: "transcript", kind: "assistant", text: '🎙️ "test"', turnMessageId: "transcript" }),
    ]);
    const turns = groupMessages(messages);

    expect(turns).toHaveLength(2);
    expect(turns[0]!.user).toBeNull();
    expect(turns[0]!.outputs[0]!.messageId).toBe("assistant-self-turn");
    expect(turns[0]!.outputs[0]!.parts).toMatchObject([{ type: "text", text: "Assistant vorher" }]);
    expect(turns[1]!.user?.messageId).toBe("voice-turn");
    expect(turns[1]!.user?.parts).toMatchObject([{ type: "audio", url: "https://example.local/user.mp4" }]);
    expect(turns[1]!.outputs[0]!.parts[0]).toMatchObject({ type: "text", text: '🎙️ "test"' });
  });

  it("does not let assistant TTS audio absorb later user voice into assistant outputs", () => {
    const messages = normalizeTranscript([
      line({ id: "text-user", kind: "user", text: "Blabla", turnMessageId: "text-turn" }),
      line({ id: "assistant-text", kind: "assistant", text: "Blabla angekommen" }),
      line({
        id: "assistant-tts",
        kind: "audio-out",
        role: "assistant",
        text: "",
        turnMessageId: "assistant-audio-turn",
        audioUrl: "https://example.local/assistant.mp3",
        mimeType: "audio/mpeg",
        fileName: "audio.mpeg",
      }),
      line({
        id: "voice-line",
        kind: "audio-out",
        role: "user",
        text: "user> [voice]",
        turnMessageId: "voice-turn",
        audioUrl: "https://example.local/user.mp4",
        mimeType: "audio/mp4",
      }),
      line({ id: "transcript", kind: "assistant", text: '🎙️ "test"' }),
    ]);
    const turns = groupMessages(messages);

    expect(turns).toHaveLength(2);
    expect(turns[0]!.user?.messageId).toBe("text-turn");
    expect(turns[0]!.outputs.some((output) => output.parts.some((part) => part.type === "audio"))).toBe(true);
    expect(turns[1]!.user?.messageId).toBe("voice-turn");
    expect(turns[1]!.user?.role).toBe("user");
    expect(turns[1]!.user?.parts).toMatchObject([{ type: "audio", url: "https://example.local/user.mp4" }]);
    expect(turns[1]!.outputs[0]!.parts[0]).toMatchObject({ type: "text", text: '🎙️ "test"' });
  });

  it("does not attach a later user voice to the previous text user turn", () => {
    const messages = normalizeTranscript([
      line({ id: "text-user", kind: "user", text: "Blabla", turnMessageId: "text-turn" }),
      line({ id: "assistant-before", kind: "assistant", text: "Blabla angekommen" }),
      line({
        id: "voice-line",
        kind: "audio-out",
        role: "user",
        text: "user> [voice]",
        turnMessageId: "voice-turn",
        audioUrl: "https://example.local/voice.mp4",
        mimeType: "audio/mp4",
      }),
      line({ id: "transcript", kind: "assistant", text: '🎙️ "test"' }),
    ]);
    const turns = groupMessages(messages);

    expect(turns).toHaveLength(2);
    expect(turns[0]!.user?.messageId).toBe("text-turn");
    expect(turns[0]!.user?.parts).toMatchObject([{ type: "text", text: "Blabla" }]);
    expect(turns[0]!.outputs[0]!.parts[0]).toMatchObject({ type: "text", text: "Blabla angekommen" });
    expect(turns[0]!.outputs.some((output) => output.parts.some((part) => part.type === "audio"))).toBe(false);
    expect(turns[1]!.user?.messageId).toBe("voice-turn");
    expect(turns[1]!.user?.parts).toMatchObject([{ type: "audio", url: "https://example.local/voice.mp4" }]);
    expect(turns[1]!.outputs[0]!.parts[0]).toMatchObject({ type: "text", text: '🎙️ "test"' });
  });

  it("starts a new right-aligned user turn for voice recorded after assistant output", () => {
    const messages = normalizeTranscript([
      line({ id: "assistant-before", kind: "assistant", text: "Vorherige Antwort" }),
      line({
        id: "voice-after-assistant",
        kind: "audio-out",
        role: "user",
        text: "user> [voice]",
        turnMessageId: "turn-after-assistant",
        audioUrl: "https://example.local/voice-after.mp4",
        mimeType: "audio/mp4",
      }),
      line({
        id: "transcript-after-assistant",
        kind: "assistant",
        text: '🎙️ "Dies ist ein Test."',
      }),
    ]);
    const turns = groupMessages(messages);

    expect(turns).toHaveLength(2);
    expect(turns[0]!.user).toBeNull();
    expect(turns[1]!.user?.messageId).toBe("turn-after-assistant");
    expect(turns[1]!.user?.role).toBe("user");
    expect(turns[1]!.user?.parts).toMatchObject([
      { type: "audio", url: "https://example.local/voice-after.mp4" },
    ]);
    expect(turns[1]!.outputs[0]!.parts[0]).toMatchObject({
      type: "text",
      text: '🎙️ "Dies ist ein Test."',
    });
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
      rawText: "read_file: main.py",
    });
  });

  it("hides finished tool notices from the visible transcript", () => {
    const messages = normalizeTranscript([
      line({
        id: "t1",
        kind: "notice",
        noticeKind: "tool",
        text: "read_file: done",
        toolName: "read_file",
        toolStatus: "success",
        toolResult: "ok",
      }),
    ]);
    expect(messages[0]!.parts).toEqual([]);
  });

  it("keeps failed tool notices visible", () => {
    const messages = normalizeTranscript([
      line({
        id: "t1",
        kind: "notice",
        noticeKind: "tool",
        text: "text_to_speech: failed",
        toolName: "text_to_speech",
        toolStatus: "error",
        toolError: "provider timeout",
      }),
    ]);
    expect(messages[0]!.parts[0]).toMatchObject({
      type: "tool_call",
      status: "error",
      toolName: "text_to_speech",
    });
  });

  it("groups consecutive tool notices into one live timeline while a later tool runs", () => {
    const messages = normalizeTranscript([
      line({
        id: "t1",
        kind: "notice",
        noticeKind: "tool",
        text: 'search_files: "package.json"',
        toolName: "search_files",
        toolStatus: "success",
      }),
      line({
        id: "t2",
        kind: "notice",
        noticeKind: "tool",
        text: 'terminal: "sleep 5; date"',
        toolName: "terminal",
        toolStatus: "running",
      }),
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.parts[0]).toMatchObject({
      type: "tool_call",
      status: "running",
      toolName: "terminal",
    });
    expect(messages[0]!.parts[0]).toMatchObject({
      rawText: expect.stringContaining("search_files"),
    });
  });

  it("shows live tool-like info notices while they are running", () => {
    const messages = normalizeTranscript([
      line({
        id: "t1",
        kind: "notice",
        noticeKind: "info",
        text: 'Browsing the web\n"https://duckduckgo.com/?q=test"\nRUNNING',
      }),
    ]);
    expect(messages[0]!.parts[0]).toMatchObject({
      type: "tool_call",
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
