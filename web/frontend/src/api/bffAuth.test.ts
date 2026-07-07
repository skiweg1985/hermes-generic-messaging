import { describe, expect, it } from "vitest";

import { appendBffAuthQuery, bffAuthHeaders } from "./bffAuth";

describe("bffAuth", () => {
  it("does not add headers without a token", () => {
    expect(bffAuthHeaders()).toEqual({});
    expect(bffAuthHeaders("   ")).toEqual({});
  });

  it("adds a bearer header for configured tokens", () => {
    expect(bffAuthHeaders("secret-token")).toEqual({
      Authorization: "Bearer secret-token",
    });
  });

  it("appends websocket auth query tokens", () => {
    expect(appendBffAuthQuery("ws://localhost:8000/ws/chat", "secret-token")).toBe(
      "ws://localhost:8000/ws/chat?auth_token=secret-token",
    );
  });

  it("preserves existing websocket query parameters", () => {
    expect(appendBffAuthQuery("ws://localhost:8000/ws/chat?x=1", "secret token")).toBe(
      "ws://localhost:8000/ws/chat?x=1&auth_token=secret+token",
    );
  });
});
