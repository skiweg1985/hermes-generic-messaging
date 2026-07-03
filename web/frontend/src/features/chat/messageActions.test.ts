import { describe, expect, it } from "vitest";
import {
  downloadableUrlForLine,
  replyTargetFromLine,
  transcriptLinePreview,
  withReplyPrefix,
} from "./messageActions";
import type { TranscriptLine } from "../../types/events";

describe("messageActions", () => {
  it("builds compact reply targets from transcript lines", () => {
    const line: TranscriptLine = {
      id: "a1",
      kind: "assistant",
      text: "A useful answer",
    };
    const target = replyTargetFromLine(line);
    expect(target).toMatchObject({
      lineId: "a1",
      role: "assistant",
      label: "Hermes",
      preview: "A useful answer",
    });
  });

  it("uses a text prefix for Hermes reply context", () => {
    const text = withReplyPrefix("Danke", {
      lineId: "a1",
      role: "assistant",
      label: "Hermes",
      preview: "A useful answer",
    });
    expect(text).toContain("Replying to Hermes:");
    expect(text).toContain("> A useful answer");
    expect(text.endsWith("Danke")).toBe(true);
  });

  it("labels voice messages without exposing filenames", () => {
    const line: TranscriptLine = {
      id: "v1",
      kind: "audio-out",
      role: "assistant",
      text: "",
      audioUrl: "/media/v1",
      fileName: "tts_20260704.mp3",
    };
    expect(transcriptLinePreview(line)).toBe("Voice message");
    expect(downloadableUrlForLine(line)).toBe("/media/v1");
  });
});
