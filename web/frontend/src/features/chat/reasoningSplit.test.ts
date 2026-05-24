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
});

describe("normalizeReasoningDisplay", () => {
  it("breaks inline section headers onto their own lines", () => {
    const raw =
      "Some thought here **Reasoning:** more text **Responding simply:** final bit";
    expect(normalizeReasoningDisplay(raw)).toContain("\n\n**Reasoning:**\n\n");
    expect(normalizeReasoningDisplay(raw)).toContain("\n\n**Responding simply:**\n\n");
  });
});
