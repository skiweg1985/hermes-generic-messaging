import { afterEach, describe, expect, it, vi } from "vitest";
import { chatReducer, initialChatState } from "./chatReducer";
import { MAX_TRANSCRIPT_LINES, loadChatState, persistChatState } from "./sessionPersistence";

describe("sessionPersistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips sessions and the active chat", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });

    let state = initialChatState("c1", "one");
    state = chatReducer(state, { type: "CREATE_CHAT", chatId: "c2", label: "two" });
    state = chatReducer(state, { type: "USER_TEXT", text: "hello" });

    persistChatState(state);
    const loaded = loadChatState(initialChatState("fallback", "fallback"));

    expect(loaded.activeChatId).toBe("c2");
    expect(loaded.sessionsById.c2.lines[0].text).toBe("hello");
  });

  it("clears running tool status on persist", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });

    let state = initialChatState("c1", "one");
    state = {
      ...state,
      sessionsById: {
        c1: {
          ...state.sessionsById.c1,
          lines: [
            {
              id: "tool-1",
              kind: "notice",
              text: "Computing",
              toolName: "terminal",
              toolStatus: "running",
            },
          ],
        },
      },
    };

    persistChatState(state);
    const loaded = loadChatState(initialChatState("fallback", "fallback"));

    expect(loaded.sessionsById.c1.lines[0].toolStatus).toBe("idle");
  });

  it("trims transcript history on persist", () => {
    const localStorage = memoryStorage();
    vi.stubGlobal("window", { localStorage });

    let state = initialChatState("c1", "one");
    for (let i = 0; i < MAX_TRANSCRIPT_LINES + 5; i += 1) {
      state = chatReducer(state, { type: "USER_TEXT", text: `line ${i}` });
    }

    persistChatState(state);
    const loaded = loadChatState(initialChatState("fallback", "fallback"));

    expect(loaded.sessionsById.c1.lines).toHaveLength(MAX_TRANSCRIPT_LINES);
    expect(loaded.sessionsById.c1.lines[0].text).toBe("line 5");
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  };
}
