import { describe, expect, it } from "vitest";
import { draftReducer, emptyDraft, getDraft, type DraftMap } from "./draftStore";

const replyTarget = {
  lineId: "l1",
  role: "assistant" as const,
  label: "Hermes",
  preview: "Previous answer",
};

describe("draftReducer", () => {
  it("sets input per chat", () => {
    const map = draftReducer({}, { type: "SET_INPUT", chatId: "c1", input: "hi" });
    expect(getDraft(map, "c1").input).toBe("hi");
    expect(getDraft(map, "c2").input).toBe("");
  });

  it("sets and clears a reply target", () => {
    let map = draftReducer({}, { type: "SET_REPLY_TARGET", chatId: "c1", target: replyTarget });
    expect(getDraft(map, "c1").replyTarget?.lineId).toBe("l1");
    map = draftReducer(map, { type: "CLEAR_REPLY_TARGET", chatId: "c1" });
    expect(getDraft(map, "c1").replyTarget).toBeUndefined();
  });

  it("clears a stale reply target when its line is deleted", () => {
    let map = draftReducer({}, { type: "SET_REPLY_TARGET", chatId: "c1", target: replyTarget });
    map = draftReducer(map, { type: "CLEAR_REPLY_FOR_LINE", chatId: "c1", lineId: "other" });
    expect(getDraft(map, "c1").replyTarget?.lineId).toBe("l1");
    map = draftReducer(map, { type: "CLEAR_REPLY_FOR_LINE", chatId: "c1", lineId: "l1" });
    expect(getDraft(map, "c1").replyTarget).toBeUndefined();
  });

  it("tracks the pending attachment upload lifecycle", () => {
    let map: DraftMap = draftReducer(
      {},
      { type: "ADD_PENDING_ATTACHMENT", chatId: "c1", localId: "a1", fileName: "f.png", mimeType: "image/png" },
    );
    expect(getDraft(map, "c1").pendingAttachments[0].status).toBe("queued");

    map = draftReducer(map, {
      type: "SET_PENDING_ATTACHMENT_STATUS",
      chatId: "c1",
      localId: "a1",
      status: "done",
      result: {
        url: "https://example.local/f.png",
        mime_type: "image/png",
        size_bytes: 1,
        filename: "f.png",
        attachment_id: "att1",
      },
    });
    expect(getDraft(map, "c1").pendingAttachments[0].status).toBe("done");

    map = draftReducer(map, { type: "REMOVE_PENDING_ATTACHMENT", chatId: "c1", localId: "a1" });
    expect(getDraft(map, "c1").pendingAttachments).toHaveLength(0);
  });

  it("clears the whole draft on send", () => {
    let map = draftReducer({}, { type: "SET_INPUT", chatId: "c1", input: "text" });
    map = draftReducer(map, { type: "SET_REPLY_TARGET", chatId: "c1", target: replyTarget });
    map = draftReducer(map, { type: "CLEAR_DRAFT", chatId: "c1" });
    expect(getDraft(map, "c1")).toEqual(emptyDraft());
  });
});
