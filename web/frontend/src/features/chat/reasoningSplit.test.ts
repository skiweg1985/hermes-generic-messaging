import { describe, expect, it } from "vitest";
import { normalizeReasoningDisplay, splitReasoning } from "./reasoningSplit";

describe("splitReasoning", () => {
  it("splits on the last blank line so multi-paragraph reasoning stays together", () => {
    const reasoning =
      "**Reasoning:**\n\nI think the user might be asking if I'm here.\n\n**Responding simply**\n\nSo I'll keep it short.";
  const answer = "Ja, läuft – ich bin da.";
    const text = `💭 Reasoning:\n${reasoning}\n\n${answer}`;
    const { reasoning: gotReasoning, answer: gotAnswer } = splitReasoning(text);
    expect(gotReasoning).toBe(reasoning);
    expect(gotAnswer).toBe(answer);
  });

  it("returns plain assistant text unchanged", () => {
    expect(splitReasoning("Hello back")).toEqual({
      reasoning: "",
      answer: "Hello back",
    });
  });

  it("splits implicit TTS reasoning headers from the answer", () => {
    expect(
      splitReasoning(
        "**Generating TTS** I need to create text-to-speech.\n\nHier ist deine Sprachi:",
      ),
    ).toEqual({
      reasoning: "**Generating TTS** I need to create text-to-speech.",
      answer: "Hier ist deine Sprachi:",
    });
  });

  it("splits implicit TTS reasoning when the answer starts on the next line", () => {
    expect(
      splitReasoning(
        "**Generating TTS** I need to create text-to-speech.\nHier ist deine Sprachi:",
      ),
    ).toEqual({
      reasoning: "**Generating TTS** I need to create text-to-speech.",
      answer: "Hier ist deine Sprachi:",
    });
  });

  it("splits implicit TTS reasoning after a Hermes reasoning prefix", () => {
    expect(
      splitReasoning(
        "💭 Reasoning:\n**Generating TTS** I need to create audio.\nHier ist deine Sprachi:",
      ),
    ).toEqual({
      reasoning: "**Generating TTS** I need to create audio.",
      answer: "Hier ist deine Sprachi:",
    });
  });

  it("splits fenced Hermes reasoning before the final answer", () => {
    expect(
      splitReasoning(
        "💭 **Reasoning:**\n```\n**Generating TTS**\n\nI need audio.\n```\n\nHier ist deine Sprachi:\n\nWenn du willst, mache ich dir noch eine.",
      ),
    ).toEqual({
      reasoning: "**Generating TTS**\n\nI need audio.",
      answer: "Hier ist deine Sprachi:\n\nWenn du willst, mache ich dir noch eine.",
    });
  });

  it("does not absorb tool or info lines after fenced reasoning", () => {
    expect(
      splitReasoning(
        "💭 **Reasoning:**\n```\n**Checking tool output**\n\nI should inspect the tool result.\n```\n\n📚 skill_view: messaging-modality-audio",
      ),
    ).toEqual({
      reasoning: "**Checking tool output**\n\nI should inspect the tool result.",
      answer: "📚 skill_view: messaging-modality-audio",
    });
  });

  it("does not absorb tool or info lines into implicit TTS reasoning", () => {
    expect(
      splitReasoning(
        "**Generating TTS** I should prepare audio.\n📚 skill_view: messaging-modality-audio\nVoice mode enabled.",
      ),
    ).toEqual({
      reasoning: "**Generating TTS** I should prepare audio.",
      answer: "📚 skill_view: messaging-modality-audio\nVoice mode enabled.",
    });
  });
});

describe("normalizeReasoningDisplay", () => {
  it("breaks inline section headers onto their own lines", () => {
    const raw =
      "Some thought here **Reasoning:** more text **Responding simply:** final bit";
    expect(normalizeReasoningDisplay(raw)).toContain("\n\n**Reasoning:**\n\n");
    expect(normalizeReasoningDisplay(raw)).toContain("\n\n**Responding simply:**\n\n");
  });
});
