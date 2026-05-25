import { describe, expect, it } from "vitest";

import { normalizeMimeType } from "./normalizeMimeType";

describe("normalizeMimeType", () => {
  it("strips codec parameters", () => {
    expect(normalizeMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
  });

  it("lowercases and trims", () => {
    expect(normalizeMimeType("  Audio/WebM  ")).toBe("audio/webm");
  });
});
