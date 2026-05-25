/** Strip the leading 💭 Reasoning marker Hermes prepends to final text. */
export function stripReasoningPrefix(text: string): string {
  return text.replace(/^\s*💭\s*(reasoning:?\s*)?/i, "").trim();
}

/** Put inline section headers on their own lines for readable markdown blocks. */
export function normalizeReasoningDisplay(text: string): string {
  return text
    .replace(/\s+(\*\*(?:Reasoning|Responding[^*]*):\*\*)/gi, "\n\n$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split prepended reasoning from the user-facing answer in `final_text`.
 * Uses the last blank-line boundary so multi-paragraph reasoning stays intact.
 */
export function splitReasoning(text: string): { reasoning: string; answer: string } {
  if (!text.trimStart().startsWith("💭")) {
    return { reasoning: "", answer: text };
  }
  const stripped = stripReasoningPrefix(text);
  const idx = stripped.lastIndexOf("\n\n");
  if (idx < 0) {
    return { reasoning: stripped, answer: "" };
  }
  return {
    reasoning: stripped.slice(0, idx).trim(),
    answer: stripped.slice(idx + 2).trim(),
  };
}
