import { describe, expect, it } from "vitest";
import {
  normalizeThemePreference,
  resolveTheme,
  THEME_COLORS,
} from "./theme";

describe("normalizeThemePreference", () => {
  it("passes through valid preferences", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
  });

  it("falls back to system for garbage input", () => {
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference(undefined)).toBe("system");
    expect(normalizeThemePreference("")).toBe("system");
    expect(normalizeThemePreference("blue")).toBe("system");
    expect(normalizeThemePreference(42)).toBe("system");
    expect(normalizeThemePreference({})).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("resolves system from the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  it("pins explicit preferences regardless of the OS", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("THEME_COLORS", () => {
  it("matches --surface-canvas per theme", () => {
    expect(THEME_COLORS.dark).toBe("#0a0a0c");
    expect(THEME_COLORS.light).toBe("#f7f8fa");
  });
});
