import { bffAuthHeaders } from "./bffAuth";
import type { ChatState } from "../types/events";
import { stateFromStoredState, toStoredState, type StoredState } from "../features/chat/sessionPersistence";

const SESSIONS_ENDPOINT = "/api/v1/sessions";

export async function fetchStoredChatState(): Promise<StoredState | null> {
  const res = await fetch(SESSIONS_ENDPOINT, {
    method: "GET",
    headers: { ...bffAuthHeaders(), Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as StoredState;
}

export async function loadRemoteChatState(fallback: ChatState): Promise<ChatState | null> {
  const stored = await fetchStoredChatState();
  if (!stored || !Array.isArray(stored.sessions) || stored.sessions.length === 0) {
    return null;
  }
  return stateFromStoredState(stored, fallback);
}

export async function persistRemoteChatState(state: ChatState): Promise<void> {
  await fetch(SESSIONS_ENDPOINT, {
    method: "PUT",
    headers: {
      ...bffAuthHeaders(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(toStoredState(state)),
  });
}
