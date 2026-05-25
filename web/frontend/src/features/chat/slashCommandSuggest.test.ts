import { describe, expect, it } from "vitest";
import {
  applySlashCommand,
  filterSlashCommands,
  getSlashSuggestionQuery,
} from "./slashCommandSuggest";

describe("getSlashSuggestionQuery", () => {
  it("returns empty query for lone slash", () => {
    expect(getSlashSuggestionQuery("/", 1)).toBe("");
  });

  it("returns partial token while typing", () => {
    expect(getSlashSuggestionQuery("/mod", 4)).toBe("mod");
  });

  it("returns null after the first space", () => {
    expect(getSlashSuggestionQuery("/model gpt-4", 7)).toBeNull();
  });

  it("returns null when input does not start with slash", () => {
    expect(getSlashSuggestionQuery("hello", 5)).toBeNull();
  });
});

describe("filterSlashCommands", () => {
  it("lists all commands for empty query", () => {
    expect(filterSlashCommands("").length).toBeGreaterThan(0);
  });

  it("filters by prefix", () => {
    const names = filterSlashCommands("re").map((c) => c.name);
    expect(names).toContain("/reset");
    expect(names).toContain("/reload-mcp");
    expect(names).not.toContain("/model");
  });
});

describe("applySlashCommand", () => {
  it("replaces the command token and keeps trailing args", () => {
    expect(applySlashCommand("/mo extra", { name: "/model", description: "" })).toBe(
      "/model extra",
    );
  });
});
