import { describe, expect, it } from "vitest";
import { parseActivity, parseStructuredActivity } from "./toolRegistry";

describe("parseActivity", () => {
  it("detects running state from keywords", () => {
    const parsed = parseActivity("read_file → fetching src/main.py");
    expect(parsed.state).toBe("running");
    expect(parsed.rawName).toBe("read_file");
  });

  it("detects success state", () => {
    const parsed = parseActivity("read_file: done");
    expect(parsed.state).toBe("success");
  });

  it("detects error state", () => {
    const parsed = parseActivity("shell: command failed");
    expect(parsed.state).toBe("error");
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
    expect(parsed?.detail).toBe("ok");
  });

  it("returns null without structured fields", () => {
    expect(parseStructuredActivity({ text: "read_file: x" })).toBeNull();
  });
});
