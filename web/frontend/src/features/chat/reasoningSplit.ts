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
    const implicit = splitImplicitReasoning(text);
    if (implicit) return implicit;
    return { reasoning: "", answer: text };
  }
  const stripped = stripReasoningPrefix(text);
  const fenced = splitFencedReasoning(stripped);
  if (fenced) return fenced;
  const implicit = splitImplicitReasoning(stripReasoningMarkdownHeading(stripped));
  if (implicit) return implicit;
  const idx = stripped.lastIndexOf("\n\n");
  if (idx < 0) {
    return { reasoning: stripped, answer: "" };
  }
  return {
    reasoning: stripped.slice(0, idx).trim(),
    answer: stripped.slice(idx + 2).trim(),
  };
}

function splitImplicitReasoning(text: string): { reasoning: string; answer: string } | null {
  const trimmed = text.trimStart();
  if (!/^\*\*Generating TTS[^*]*\*\*/i.test(trimmed)) {
    return null;
  }
  const boundary = findImplicitAnswerBoundary(trimmed);
  if (boundary < 0) return null;
  const reasoning = trimmed.slice(0, boundary).trim();
  const answer = trimmed.slice(boundary).trim();
  if (!reasoning || !answer) return null;
  return { reasoning, answer };
}

function splitFencedReasoning(text: string): { reasoning: string; answer: string } | null {
  const match = /^\s*(?:\*\*Reasoning:\*\*\s*)?```[^\n]*\n([\s\S]*?)\n```\s*([\s\S]*)$/i.exec(text);
  if (!match) return null;
  const reasoning = match[1]?.trim() ?? "";
  const answer = match[2]?.trim() ?? "";
  if (!reasoning) return null;
  return { reasoning, answer };
}

function stripReasoningMarkdownHeading(text: string): string {
  return text.replace(/^\s*\*\*Reasoning:\*\*\s*/i, "").trimStart();
}

function findImplicitAnswerBoundary(text: string): number {
  const explicit = findLineBoundary(text, [
    /^\s*(?:hier ist|hier sind|hier kommt|hier hast du|fertig\b)/i,
    /^\s*(?:here(?:'s| is| are)|done\b|finished\b)/i,
    /^\s*(?:voice mode enabled|how\s+\/voice\s+works)\b/i,
    /^\s*(?:🔧|🛠️|📚|ℹ️|✅|⚠️|❌)\s*\S/,
    /^\s*(?:tool|info|notice|warning|error|system):\s+/i,
  ]);
  if (explicit >= 0) return explicit;
  return text.search(/\n\s*\n/);
}

function findLineBoundary(text: string, patterns: RegExp[]): number {
  let offset = 0;
  for (const line of text.split(/(\n)/)) {
    if (line === "\n") {
      offset += line.length;
      continue;
    }
    if (offset > 0 && patterns.some((pattern) => pattern.test(line))) {
      return offset;
    }
    offset += line.length;
  }
  return -1;
}
