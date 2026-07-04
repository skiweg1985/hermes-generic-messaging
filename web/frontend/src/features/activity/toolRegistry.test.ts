import { describe, expect, it } from "vitest";
import { parseActivity, parseStructuredActivity } from "./toolRegistry";

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
