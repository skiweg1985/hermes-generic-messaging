import { describe, expect, it, vi } from "vitest";
import { resolveMediaUrl } from "./resolveMediaUrl";

describe("resolveMediaUrl", () => {
  it("keeps relative BFF media paths", () => {
    vi.stubGlobal("window", { location: { href: "http://127.0.0.1:5173/" } });
    expect(resolveMediaUrl("/api/v1/media/abc-123")).toBe("/api/v1/media/abc-123");
  });

  it("rewrites absolute BFF media URLs to same-origin path", () => {
    vi.stubGlobal("window", { location: { href: "http://127.0.0.1:5173/" } });
    expect(resolveMediaUrl("http://192.168.1.10:8000/api/v1/media/abc-123")).toBe(
      "/api/v1/media/abc-123",
    );
  });

  it("adds BFF auth query tokens to same-origin media URLs", () => {
    vi.stubGlobal("window", {
      location: { href: "http://127.0.0.1:5173/" },
      localStorage: { getItem: () => "secret-token" },
    });
    expect(resolveMediaUrl("/api/v1/media/abc-123")).toBe(
      "/api/v1/media/abc-123?auth_token=secret-token",
    );
  });

  it("leaves unrelated URLs unchanged", () => {
    vi.stubGlobal("window", { location: { href: "http://127.0.0.1:5173/" } });
    expect(resolveMediaUrl("https://example.local/cat.png")).toBe(
      "https://example.local/cat.png",
    );
  });
});
