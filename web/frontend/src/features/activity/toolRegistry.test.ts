import { describe, expect, it } from "vitest";
import { parseActivity, parseStructuredActivity, parseStructuredActivityTimeline } from "./toolRegistry";

describe("parseActivity", () => {
  it("detects running state from keywords", () => {
    const parsed = parseActivity("read_file → fetching src/main.py");
    expect(parsed.state).toBe("running");
    expect(parsed.rawName).toBe("read_file");
  });

  it("detects web browsing as running", () => {
    const parsed = parseActivity('Browsing the web\n"https://duckduckgo.com/?q=test"\nRUNNING');
    expect(parsed.state).toBe("running");
    expect(parsed.meta.kind).toBe("web");
  });

  it("detects success state", () => {
    const parsed = parseActivity("read_file: done");
    expect(parsed.state).toBe("success");
  });

  it("detects error state", () => {
    const parsed = parseActivity("shell: command failed");
    expect(parsed.state).toBe("error");
  });

  it("parses legacy emoji-prefixed tool progress lines", () => {
    const parsed = parseActivity("💻 read_file: src/main.py");
    expect(parsed.rawName).toBe("read_file");
    expect(parsed.meta.kind).toBe("file");
    expect(parsed.summary).toBe("src/main.py");
    expect(parsed.state).toBe("idle");
  });
});

describe("parseStructuredActivity", () => {
  it("prefers structured fields over text parsing", () => {
    const parsed = parseStructuredActivity({
      text: "read_file: still running",
      toolName: "read_file",
      toolStatus: "success",
      toolResult: "ok",
    });
    expect(parsed?.state).toBe("success");
    expect(parsed?.rawName).toBe("read_file");
    expect(parsed?.detail).toBe("Result:\nok");
  });

  it("uses structured tool name for labels and compact details", () => {
    const parsed = parseStructuredActivity({
      text: "Working…",
      toolName: "text_to_speech",
      toolStatus: "running",
      toolArgs: '{"text":"hello"}',
    });
    expect(parsed?.meta.kind).toBe("audio");
    expect(parsed?.title).toBe("Working with audio");
    expect(parsed?.summary).toBe("Working…");
    expect(parsed?.detail).toContain("Args:");
  });

  it("keeps idle structured activity from spinning after persistence", () => {
    const parsed = parseStructuredActivity({
      text: "read_file: stale",
      toolName: "read_file",
      toolStatus: "idle",
    });
    expect(parsed?.state).toBe("idle");
    expect(parsed?.title).toBe("Reading files");
  });

  it("returns null without structured fields", () => {
    expect(parseStructuredActivity({ text: "read_file: x" })).toBeNull();
  });
});

describe("parseStructuredActivityTimeline", () => {
  it("splits accumulated Hermes progress text into a compact timeline", () => {
    const parsed = parseStructuredActivityTimeline({
      text: [
        "🔍 search_files: \"package.json\"",
        "💻 terminal",
        "```",
        "npm run build",
        "```",
        "📖 read_file: \"src/main.tsx\"",
      ].join("\n"),
      toolStatus: "running",
    });

    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries.map((entry) => entry.rawName)).toEqual([
      "search_files",
      "terminal",
      "read_file",
    ]);
    expect(parsed.entries[0]?.state).toBe("success");
    expect(parsed.entries[1]?.summary).toBe("npm run build");
    expect(parsed.entries[2]?.state).toBe("running");
    expect(parsed.primary.summary).toContain("3 tools");
  });

  it("extracts terminal result previews from structured JSON", () => {
    const parsed = parseStructuredActivityTimeline({
      text: "terminal: npm test",
      toolName: "terminal",
      toolStatus: "success",
      toolArgs: JSON.stringify({ command: "npm test", timeout: 300 }),
      toolResult: JSON.stringify({
        output: "line 1\nline 2\n42 passed",
        exit_code: 0,
        error: null,
      }),
    });

    expect(parsed.primary.summary).toBe("npm test");
    expect(parsed.primary.detail).toContain("exit 0");
    expect(parsed.primary.detail).toContain("42 passed");
  });
});
