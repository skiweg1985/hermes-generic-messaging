import type { PendingAttachment, ReplyTarget } from "../../types/events";

/**
 * Composer draft state, kept separate from the chat transcript domain. One
 * draft per chat holds the in-progress input, an optional reply target and the
 * upload queue. Only the text input is persisted; attachments and reply targets
 * are session-local.
 */
export interface Draft {
  input: string;
  replyTarget?: ReplyTarget;
  pendingAttachments: PendingAttachment[];
}

export type DraftMap = Record<string, Draft>;

const STORAGE_KEY = "custom-chat-web:drafts:v1";

export function emptyDraft(): Draft {
  return { input: "", pendingAttachments: [] };
}

export function getDraft(map: DraftMap, chatId: string): Draft {
  return map[chatId] ?? emptyDraft();
}

export type DraftAction =
  | { type: "SET_INPUT"; chatId: string; input: string }
  | { type: "SET_REPLY_TARGET"; chatId: string; target: ReplyTarget }
  | { type: "CLEAR_REPLY_TARGET"; chatId: string }
  | { type: "CLEAR_REPLY_FOR_LINE"; chatId: string; lineId: string }
  | { type: "ADD_PENDING_ATTACHMENT"; chatId: string; localId: string; fileName: string; mimeType: string }
  | {
      type: "SET_PENDING_ATTACHMENT_STATUS";
      chatId: string;
      localId: string;
      status: PendingAttachment["status"];
      error?: { code: string; message: string };
      result?: PendingAttachment["result"];
    }
  | { type: "REMOVE_PENDING_ATTACHMENT"; chatId: string; localId: string }
  | { type: "CLEAR_PENDING_ATTACHMENTS"; chatId: string }
  | { type: "CLEAR_DRAFT"; chatId: string };

function update(map: DraftMap, chatId: string, updater: (draft: Draft) => Draft): DraftMap {
  const next = updater(getDraft(map, chatId));
  return { ...map, [chatId]: next };
}

export function draftReducer(map: DraftMap, action: DraftAction): DraftMap {
  switch (action.type) {
    case "SET_INPUT":
      return update(map, action.chatId, (draft) => ({ ...draft, input: action.input }));
    case "SET_REPLY_TARGET":
      return update(map, action.chatId, (draft) => ({ ...draft, replyTarget: action.target }));
    case "CLEAR_REPLY_TARGET":
      return update(map, action.chatId, (draft) =>
        draft.replyTarget ? { ...draft, replyTarget: undefined } : draft,
      );
    case "CLEAR_REPLY_FOR_LINE":
      return update(map, action.chatId, (draft) =>
        draft.replyTarget?.lineId === action.lineId ? { ...draft, replyTarget: undefined } : draft,
      );
    case "ADD_PENDING_ATTACHMENT":
      return update(map, action.chatId, (draft) => ({
        ...draft,
        pendingAttachments: [
          ...draft.pendingAttachments,
          {
            localId: action.localId,
            fileName: action.fileName,
            mimeType: action.mimeType,
            status: "queued",
          },
        ],
      }));
    case "SET_PENDING_ATTACHMENT_STATUS":
      return update(map, action.chatId, (draft) => ({
        ...draft,
        pendingAttachments: draft.pendingAttachments.map((entry) =>
          entry.localId === action.localId
            ? { ...entry, status: action.status, error: action.error, result: action.result }
            : entry,
        ),
      }));
    case "REMOVE_PENDING_ATTACHMENT":
      return update(map, action.chatId, (draft) => ({
        ...draft,
        pendingAttachments: draft.pendingAttachments.filter(
          (entry) => entry.localId !== action.localId,
        ),
      }));
    case "CLEAR_PENDING_ATTACHMENTS":
      return update(map, action.chatId, (draft) => ({ ...draft, pendingAttachments: [] }));
    case "CLEAR_DRAFT":
      return update(map, action.chatId, () => emptyDraft());
    default:
      return map;
  }
}

export function loadDrafts(): DraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { input?: unknown }>;
    const map: DraftMap = {};
    for (const [chatId, value] of Object.entries(parsed)) {
      if (value && typeof value.input === "string" && value.input.length > 0) {
        map[chatId] = { input: value.input, pendingAttachments: [] };
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function persistDrafts(map: DraftMap): void {
  if (typeof window === "undefined") return;
  const payload: Record<string, { input: string }> = {};
  for (const [chatId, draft] of Object.entries(map)) {
    if (draft.input.trim().length > 0) payload[chatId] = { input: draft.input };
  }
  try {
    if (Object.keys(payload).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    /* QuotaExceededError — drop persist silently */
  }
}
