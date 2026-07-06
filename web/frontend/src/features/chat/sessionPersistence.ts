import type { ChatSession, ChatState, TranscriptLine } from "../../types/events";

const STORAGE_KEY = "custom-chat-web:sessions:v1";
const LEGACY_DEMO_CHAT_ID = "workspace:demo";
export const MAX_TRANSCRIPT_LINES = 200;
const MAX_LINE_TEXT_CHARS = 16_000;
const MAX_TOOL_FIELD_CHARS = 4_000;

export interface StoredState {
  version: 1;
  activeChatId: string | null;
  sessions: ChatSession[];
}

export function persistChatState(state: ChatState): void {
  if (typeof window === "undefined") return;
  const payload = toStoredState(state);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* QuotaExceededError — drop persist silently */
  }
}

export function loadChatState(fallback: ChatState): ChatState {
  if (typeof window === "undefined") return fallback;
  try {
    // localStorage access itself can throw (SecurityError when storage is
    // blocked/disabled). Keep it inside the try so boot never crashes — this is
    // the useReducer initializer and there is no error boundary above it.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return stateFromStoredState(parsed, fallback);
  } catch {
    return fallback;
  }
}

export function toStoredState(state: ChatState): StoredState {
  const sessions = Object.values(state.sessionsById)
    .map(trimSession)
    .filter((session) => shouldPersistSession(session));
  const hasActive = sessions.some((session) => session.chatId === state.activeChatId);
  return {
    version: 1,
    activeChatId: hasActive ? state.activeChatId : sessions[0]?.chatId ?? null,
    sessions,
  };
}

export function stateFromStoredState(
  raw: Partial<StoredState>,
  fallback: ChatState,
): ChatState {
  if (raw.version !== 1 || !Array.isArray(raw.sessions)) return fallback;
  const sessions = raw.sessions
    .filter(isStoredSession)
    .map(trimSession)
    .filter((session) => shouldPersistSession(session));
  if (sessions.length === 0) return fallback;

  const sessionsById = Object.fromEntries(
    sessions.map((session) => [session.chatId, session]),
  );
  const activeChatId =
    typeof raw.activeChatId === "string" && sessionsById[raw.activeChatId]
      ? raw.activeChatId
      : sessions[0].chatId;

  return {
    ...fallback,
    activeChatId,
    sessionsById,
  };
}

export function mergeChatStates(current: ChatState, incoming: ChatState): ChatState {
  const sessionsById = { ...incoming.sessionsById };
  for (const [chatId, session] of Object.entries(current.sessionsById)) {
    const remote = sessionsById[chatId];
    const hasLiveLocalState =
      session.streamingMessageId !== null ||
      session.streamTurnId !== null ||
      session.typing ||
      session.lines.some((line) => line.streaming);
    if (!remote || hasLiveLocalState || sessionTimestamp(session) >= sessionTimestamp(remote)) {
      sessionsById[chatId] = session;
    }
  }
  const activeChatId = sessionsById[incoming.activeChatId]
    ? incoming.activeChatId
    : sessionsById[current.activeChatId]
      ? current.activeChatId
      : Object.values(sessionsById).sort((a, b) =>
          sessionTimestamp(b).localeCompare(sessionTimestamp(a)),
        )[0]?.chatId ?? current.activeChatId;

  return {
    ...current,
    activeChatId,
    sessionsById,
  };
}

function trimSession(session: ChatSession): ChatSession {
  const lines = session.lines.slice(-MAX_TRANSCRIPT_LINES).map(trimLine);
  return {
    ...session,
    lines,
    streamingMessageId: null,
    streamTurnId: null,
    typing: false,
    typingStartedAt: undefined,
    typingClosed: false,
  };
}

function trimLine(line: TranscriptLine): TranscriptLine {
  const next = {
    ...line,
    text: truncateStoredText(line.text, MAX_LINE_TEXT_CHARS),
    caption: line.caption ? truncateStoredText(line.caption, MAX_LINE_TEXT_CHARS) : line.caption,
    reasoningText: line.reasoningText
      ? truncateStoredText(line.reasoningText, MAX_LINE_TEXT_CHARS)
      : line.reasoningText,
    toolArgs: line.toolArgs ? truncateStoredText(line.toolArgs, MAX_TOOL_FIELD_CHARS) : line.toolArgs,
    toolResult: line.toolResult ? truncateStoredText(line.toolResult, MAX_TOOL_FIELD_CHARS) : line.toolResult,
    toolError: line.toolError ? truncateStoredText(line.toolError, MAX_TOOL_FIELD_CHARS) : line.toolError,
    streaming: false,
    pendingDeltas: undefined,
  };
  if (next.toolStatus === "running") {
    return { ...next, toolStatus: "idle" };
  }
  return next;
}

function truncateStoredText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n[truncated for local persistence]`;
}

function isStoredSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ChatSession>;
  return (
    typeof session.chatId === "string" &&
    typeof session.label === "string" &&
    Array.isArray(session.lines) &&
    typeof session.createdAt === "string" &&
    typeof session.updatedAt === "string"
  );
}

function isLegacyDemoSession(session: ChatSession): boolean {
  return (
    session.chatId === LEGACY_DEMO_CHAT_ID &&
    session.label.toLowerCase() === "demo"
  );
}

function isEmptyPlaceholderSession(session: ChatSession): boolean {
  return session.lines.length === 0;
}

function shouldPersistSession(session: ChatSession): boolean {
  return !isLegacyDemoSession(session) && !isEmptyPlaceholderSession(session);
}

function sessionTimestamp(session: ChatSession): string {
  return session.updatedAt || session.createdAt || "";
}
