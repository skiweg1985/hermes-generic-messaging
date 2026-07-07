import { afterEach, describe, expect, it, vi } from "vitest";

import { initialChatState } from "../features/chat/chatReducer";
import { persistRemoteChatState } from "./sessionClient";

describe("sessionClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when remote session persistence fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }),
    );

    await expect(persistRemoteChatState(initialChatState("c1", "one"))).rejects.toThrow(
      "SESSION_PERSIST_FAILED",
    );
  });
});
