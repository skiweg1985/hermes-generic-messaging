import { useEffect, useReducer, useRef } from "react";
import {
  draftReducer,
  emptyDraft,
  getDraft,
  loadDrafts,
  persistDrafts,
  type Draft,
  type DraftAction,
  type DraftMap,
} from "../features/chat/draftStore";

export interface DraftStore {
  drafts: DraftMap;
  draftFor: (chatId: string) => Draft;
  dispatch: (action: DraftAction) => void;
}

/**
 * Owns per-chat composer drafts (input, reply target, upload queue), separate
 * from the chat transcript reducer. Text input is persisted to localStorage.
 */
export function useDraftStore(): DraftStore {
  const [drafts, dispatch] = useReducer(draftReducer, undefined, loadDrafts);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    persistDrafts(drafts);
  }, [drafts]);

  return {
    drafts,
    draftFor: (chatId: string) => getDraft(draftsRef.current, chatId) ?? emptyDraft(),
    dispatch,
  };
}
