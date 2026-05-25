import type { ChatSession, ChatState, TranscriptLine } from "../../types/events";

const STORAGE_KEY = "custom-chat-web:sessions:v1";
export const MAX_TRANSCRIPT_LINES = 200;

interface StoredState {
  version: 1;
  activeChatId: string;
  sessions: ChatSession[];
}

export function persistChatState(state: ChatState): void {
  if (typeof window === "undefined") return;
  const sessions = Object.values(state.sessionsById).map(trimSession);
  const payload: StoredState = {
    version: 1,
    activeChatId: state.activeChatId,
    sessions,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadChatState(fallback: ChatState): ChatState {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return fallback;
    const sessions = parsed.sessions.filter(isStoredSession).map(trimSession);
    if (sessions.length === 0) return fallback;

    const sessionsById = Object.fromEntries(
      sessions.map((session) => [
        session.chatId,
        { ...session, pendingAttachments: session.pendingAttachments ?? [] },
      ]),
    );
    const activeChatId =
      typeof parsed.activeChatId === "string" && sessionsById[parsed.activeChatId]
        ? parsed.activeChatId
        : sessions[0].chatId;

    return {
      ...fallback,
      activeChatId,
      sessionsById,
    };
  } catch {
    return fallback;
  }
}

function trimSession(session: ChatSession): ChatSession {
  return {
    ...session,
    lines: session.lines.slice(-MAX_TRANSCRIPT_LINES).map(trimLine),
    streamingMessageId: null,
    streamTurnId: null,
    pendingAttachments: [],
    typing: false,
    typingStartedAt: undefined,
    typingClosed: false,
  };
}

function trimLine(line: TranscriptLine): TranscriptLine {
  return { ...line, streaming: false };
}

function isStoredSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ChatSession>;
  return (
    typeof session.chatId === "string" &&
    typeof session.label === "string" &&
    Array.isArray(session.lines) &&
    typeof session.input === "string" &&
    typeof session.createdAt === "string" &&
    typeof session.updatedAt === "string"
  );
}
