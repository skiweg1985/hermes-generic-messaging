import type {
  AssistantButton,
  ChatSession,
  ChatState,
  EventEnvelope,
  TranscriptLine,
} from "../../types/events";
import { newId } from "../../lib/uuid";

const MAX_LABEL_LENGTH = 18;
const MAX_TITLE_LENGTH = 40;

export const DEFAULT_CHAT_ID = "workspace:demo";

function truncate(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

export function chatDisplayTitle(session: ChatSession): string {
  if (session.title && session.title.trim().length > 0) {
    return truncate(session.title, MAX_TITLE_LENGTH);
  }
  if (session.label && session.label.trim().length > 0) return session.label;
  const id = session.chatId;
  return id.includes(":") ? id.split(":").pop() ?? id : id;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function defaultLabel(chatId: string): string {
  const suffix = chatId.includes(":") ? chatId.split(":").pop() ?? chatId : chatId;
  return suffix.length > MAX_LABEL_LENGTH ? `${suffix.slice(0, MAX_LABEL_LENGTH - 3)}...` : suffix;
}

export function createChatSession(chatId: string, label = defaultLabel(chatId)): ChatSession {
  const timestamp = nowIso();
  return {
    chatId,
    label,
    lines: [],
    streamingMessageId: null,
    input: "",
    typing: false,
    typingClosed: false,
    unread: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const initialChatState = (
  chatId = DEFAULT_CHAT_ID,
  label = "demo",
): ChatState => {
  const session = createChatSession(chatId, label);
  return {
    connection: "connecting",
    activeChatId: chatId,
    sessionsById: { [chatId]: session },
    recording: false,
  };
};

export type ChatAction =
  | { type: "SET_CONNECTION"; connection: ChatState["connection"] }
  | { type: "SET_ACTIVE_CHAT"; chatId: string }
  | { type: "CREATE_CHAT"; chatId: string; label?: string }
  | { type: "SET_INPUT"; input: string }
  | { type: "SET_RECORDING"; recording: boolean }
  | { type: "USER_TEXT"; text: string }
  | { type: "USER_COMMAND"; command: string }
  | { type: "USER_UPLOAD"; filename: string; mime: string; size: number; url?: string; chatId?: string }
  | { type: "USER_ERROR"; code: string; message: string; chatId?: string }
  | { type: "BUTTON_CLICKED"; chatId: string; lineId: string; buttonId: string }
  | { type: "CLEAR_TYPING"; chatId: string }
  | { type: "INBOUND_EVENT"; event: EventEnvelope };

function appendLine(session: ChatSession, line: TranscriptLine): ChatSession {
  const lines = session.lines.filter((l) => l.kind !== "empty");
  return touchSession({ ...session, lines: [...lines, line] });
}

function upsertLine(session: ChatSession, line: TranscriptLine): ChatSession {
  const lines = session.lines.filter((l) => l.kind !== "empty");
  const index = lines.findIndex((entry) => entry.id === line.id);
  if (index < 0) {
    return appendLine(session, line);
  }
  const next = [...lines];
  next[index] = line;
  return touchSession({ ...session, lines: next });
}

function touchSession(session: ChatSession): ChatSession {
  return { ...session, updatedAt: nowIso() };
}

function withoutTyping(session: ChatSession): ChatSession {
  return { ...session, typing: false, typingStartedAt: undefined };
}

function openTyping(session: ChatSession): ChatSession {
  return { ...session, typingClosed: false };
}

function updateSession(
  state: ChatState,
  chatId: string,
  updater: (session: ChatSession) => ChatSession,
): ChatState {
  const existing = state.sessionsById[chatId] ?? createChatSession(chatId);
  const nextSession = updater(existing);
  return {
    ...state,
    sessionsById: {
      ...state.sessionsById,
      [chatId]: nextSession,
    },
  };
}

function updateActiveSession(
  state: ChatState,
  updater: (session: ChatSession) => ChatSession,
): ChatState {
  return updateSession(state, state.activeChatId, updater);
}

function findAssistantLineIndex(lines: TranscriptLine[], messageId: string): number {
  return lines.findIndex((l) => l.id === messageId && l.kind === "assistant");
}

function markUnread(state: ChatState, chatId: string): ChatState {
  if (chatId === state.activeChatId) return state;
  return updateSession(state, chatId, (session) => ({ ...session, unread: true }));
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_CONNECTION":
      return { ...state, connection: action.connection };
    case "SET_ACTIVE_CHAT":
      if (!state.sessionsById[action.chatId]) return state;
      return updateSession(
        { ...state, activeChatId: action.chatId },
        action.chatId,
        (session) => ({ ...session, unread: false }),
      );
    case "CREATE_CHAT": {
      const session = createChatSession(action.chatId, action.label);
      return {
        ...state,
        activeChatId: action.chatId,
        sessionsById: { ...state.sessionsById, [action.chatId]: session },
      };
    }
    case "SET_INPUT":
      return updateActiveSession(state, (session) => ({ ...session, input: action.input }));
    case "SET_RECORDING":
      return { ...state, recording: action.recording };
    case "USER_TEXT":
      return updateActiveSession(state, (session) =>
        appendLine(openTyping(session), {
          id: newId(),
          kind: "user",
          text: action.text,
        }),
      );
    case "USER_COMMAND":
      return updateActiveSession(state, (session) =>
        appendLine(openTyping(session), {
          id: newId(),
          kind: "command",
          text: action.command,
        }),
      );
    case "USER_UPLOAD":
      return updateSession(state, action.chatId ?? state.activeChatId, (session) =>
        appendLine(
          openTyping(session),
          buildAttachmentLine({
            id: newId(),
            role: "user",
            filename: action.filename,
            mime: action.mime,
            size: action.size,
            url: action.url ?? "",
          }),
        ),
      );
    case "USER_ERROR":
      return updateSession(state, action.chatId ?? state.activeChatId, (session) =>
        appendLine(session, {
          id: newId(),
          kind: "error",
          text: `error: ${action.code} - ${action.message}`,
        }),
      );
    case "BUTTON_CLICKED":
      return updateSession(state, action.chatId, (session) => {
        const lines = session.lines.map((line) =>
          line.id === action.lineId && line.kind === "buttons"
            ? { ...line, clickedButtonId: action.buttonId }
            : line,
        );
        return touchSession({ ...openTyping(session), lines });
      });
    case "CLEAR_TYPING":
      return updateSession(state, action.chatId, (session) =>
        session.typing ? touchSession({ ...session, typing: false, typingStartedAt: undefined }) : session,
      );
    case "INBOUND_EVENT":
      return reduceInbound(state, action.event);
    default:
      return state;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  return `${Math.round(bytes / 1024)}kb`;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/");
}

function fileLabel(filename: string, mime: string, size: number): string {
  return `${filename} (${mime}, ${formatSize(size)})`;
}

function buildAttachmentLine(params: {
  id: string;
  role: "user" | "assistant";
  filename: string;
  mime: string;
  size: number;
  url: string;
  threadId?: string;
  sessionId?: string;
}): TranscriptLine {
  const { id, role, filename, mime, size, url, threadId, sessionId } = params;
  const label = fileLabel(filename, mime, size);
  if (isImageMime(mime)) {
    return {
      id,
      kind: "image",
      role,
      text: label,
      imageUrl: url,
      caption: label,
      fileName: filename,
      fileUrl: url,
      sizeBytes: size,
      mimeType: mime,
      threadId,
      sessionId,
    };
  }
  if (isAudioMime(mime)) {
    return {
      id,
      kind: "audio-out",
      role,
      text: `${role}> [audio] ${label}`,
      audioUrl: url,
      fileName: filename,
      fileUrl: url,
      sizeBytes: size,
      mimeType: mime,
      threadId,
      sessionId,
    };
  }
  return {
    id,
    kind: role === "user" ? "upload" : "file",
    role,
    text: `${role === "user" ? "[upload]" : "assistant> [file]"} ${label}`,
    fileUrl: url,
    fileName: filename,
    sizeBytes: size,
    mimeType: mime,
    threadId,
    sessionId,
  };
}

function reduceInbound(state: ChatState, event: EventEnvelope): ChatState {
  const chatId = event.chat_id || state.activeChatId;
  const routed = updateSession(state, chatId, (session) => reduceSessionInbound(session, event));
  return markUnread(routed, chatId);
}

function finalizeStreamingLines(
  lines: TranscriptLine[],
  turnMessageId: string,
  streamingMessageId: string | null,
): TranscriptLine[] {
  return lines.map((line) => {
    if (!line.streaming) return line;
    const sameTurn =
      line.id === turnMessageId ||
      line.turnMessageId === turnMessageId ||
      line.id === streamingMessageId ||
      line.id.startsWith(`${turnMessageId}-s`);
    if (!sameTurn) return line;
    return { ...line, streaming: false };
  });
}

function reduceSessionInbound(session: ChatSession, event: EventEnvelope): ChatSession {
  const p = event.payload;
  switch (event.type) {
    case "assistant_start": {
      const messageId = String(p.message_id ?? newId());
      const turnMessageId =
        p.turn_message_id != null ? String(p.turn_message_id) : undefined;
      const existing = session.lines.find((line) => line.id === messageId);
      const line: TranscriptLine = {
        id: messageId,
        kind: "assistant",
        text: existing?.text ?? "",
        title: existing?.title,
        turnMessageId,
        threadId: event.thread_id,
        sessionId: event.session_id,
        streaming: true,
      };
      return {
        ...upsertLine({ ...withoutTyping(session), streamingMessageId: messageId }, line),
        streamingMessageId: messageId,
        typing: false,
        typingStartedAt: undefined,
      };
    }
    case "assistant_delta": {
      const messageId = String(p.message_id);
      const delta = String(p.delta ?? "");
      const idx = findAssistantLineIndex(session.lines, messageId);
      if (idx < 0) {
        return appendLine(
          { ...withoutTyping(session), streamingMessageId: messageId },
          {
            id: messageId,
            kind: "assistant",
            text: delta,
            threadId: event.thread_id,
            sessionId: event.session_id,
            streaming: true,
          },
        );
      }
      const lines = [...session.lines];
      const line = lines[idx];
      lines[idx] = { ...line, text: line.text + delta, streaming: true };
      return touchSession({ ...withoutTyping(session), lines, streamingMessageId: messageId });
    }
    case "assistant_segment": {
      const turnMessageId = String(p.message_id);
      const segmentMessageId = String(p.segment_message_id ?? newId());
      const label = p.label != null ? String(p.label) : undefined;
      const lines = finalizeStreamingLines(
        session.lines,
        turnMessageId,
        session.streamingMessageId,
      );
      const nextSession = touchSession({
        ...withoutTyping(session),
        lines: [
          ...lines.filter((l) => l.kind !== "empty"),
          {
            id: segmentMessageId,
            kind: "assistant",
            text: "",
            title: label,
            turnMessageId,
            threadId: event.thread_id,
            sessionId: event.session_id,
            streaming: true,
          },
        ],
        streamingMessageId: segmentMessageId,
      });
      return nextSession;
    }
    case "assistant_done": {
      const messageId = String(p.message_id);
      const interrupted = p.interrupted === true;
      const rawFinalText = p.final_text != null ? String(p.final_text) : undefined;
      const finalText = interrupted && rawFinalText === "" ? undefined : rawFinalText;
      const reasoningText =
        p.reasoning_text != null && String(p.reasoning_text).trim()
          ? String(p.reasoning_text)
          : undefined;
      const idx = findAssistantLineIndex(session.lines, messageId);
      let lines = session.lines;
      if (idx >= 0) {
        lines = [...lines];
        lines[idx] = {
          ...lines[idx],
          text: finalText ?? lines[idx].text,
          streaming: false,
          interrupted,
          ...(reasoningText ? { reasoningText } : {}),
        };
      } else if (interrupted) {
        lines = [
          ...lines,
          {
            id: messageId,
            kind: "assistant",
            text: finalText ?? "",
            streaming: false,
            interrupted: true,
          },
        ];
      }
      return touchSession({
        ...withoutTyping(session),
        lines,
        streamingMessageId: null,
        typingClosed: true,
      });
    }
    case "assistant_audio": {
      const messageId = String(p.message_id ?? newId());
      const url = String(p.url ?? p.file_ref ?? "");
      const mime = String(p.mime_type ?? "audio/mpeg");
      return appendLine(
        { ...withoutTyping(session), streamingMessageId: null },
        buildAttachmentLine({
          id: messageId,
          role: "assistant",
          filename: String(p.filename ?? `audio.${mime.split("/")[1] ?? "bin"}`),
          mime,
          size: Number(p.size_bytes ?? 0),
          url,
          threadId: event.thread_id,
          sessionId: event.session_id,
        }),
      );
    }
    case "assistant_buttons": {
      const messageId = String(
        p.message_id ?? p.confirm_id ?? p.pick_id ?? newId(),
      );
      const buttonKind = p.kind != null ? String(p.kind) : undefined;
      const line: TranscriptLine = {
        id: messageId,
        kind: "buttons",
        title: String(
          p.title ??
            (buttonKind === "slash_pick"
              ? "Options"
              : buttonKind === "model_picker"
                ? "Model Configuration"
                : "Confirmation"),
        ),
        text: String(p.body ?? p.text ?? ""),
        confirmId: p.confirm_id != null ? String(p.confirm_id) : messageId,
        pickId: p.pick_id != null ? String(p.pick_id) : undefined,
        commandBase: p.command != null ? String(p.command) : undefined,
        buttonKind,
        buttons: normalizeButtons(p.buttons),
        threadId: event.thread_id,
        sessionId: event.session_id,
      };
      const upsert = buttonKind === "model_picker";
      return (upsert ? upsertLine : appendLine)(withoutTyping(session), line);
    }
    case "assistant_notice": {
      const messageId = String(p.message_id ?? newId());
      const noticeKind = String(p.kind ?? "info");
      const line: TranscriptLine = {
        id: messageId,
        kind: "notice",
        text: String(p.text ?? ""),
        noticeKind,
        threadId: event.thread_id,
        sessionId: event.session_id,
      };
      const upsert = noticeKind === "tool" || noticeKind === "reasoning";
      return (upsert ? upsertLine : appendLine)(withoutTyping(session), line);
    }
    case "assistant_image": {
      const messageId = String(p.message_id ?? newId());
      return appendLine(
        withoutTyping(session),
        {
          id: messageId,
          kind: "image",
          role: "assistant",
          text: String(p.caption ?? ""),
          imageUrl: String(p.url ?? ""),
          caption: p.caption != null ? String(p.caption) : undefined,
          mimeType: p.mime_type != null ? String(p.mime_type) : undefined,
          threadId: event.thread_id,
          sessionId: event.session_id,
        },
      );
    }
    case "assistant_file": {
      const messageId = String(p.message_id ?? newId());
      const filename = String(p.filename ?? "file");
      const mime = String(p.mime_type ?? "application/octet-stream");
      const size = Number(p.size_bytes ?? 0);
      const url = String(p.url ?? p.file_ref ?? "");
      return appendLine(
        withoutTyping(session),
        buildAttachmentLine({
          id: messageId,
          role: "assistant",
          filename,
          mime,
          size,
          url,
          threadId: event.thread_id,
          sessionId: event.session_id,
        }),
      );
    }
    case "session_meta": {
      const rawTitle = p.title;
      const nextTitle =
        typeof rawTitle === "string" && rawTitle.trim().length > 0
          ? rawTitle.trim()
          : session.title;
      return touchSession({
        ...session,
        title: nextTitle,
        sessionId: event.session_id ?? session.sessionId,
        threadId: event.thread_id ?? session.threadId,
      });
    }
    case "typing": {
      const state = String(p.state ?? "");
      if (state === "start") {
        if (session.typingClosed) return session;
        return touchSession({
          ...session,
          typing: true,
          typingStartedAt: session.typingStartedAt ?? nowIso(),
        });
      }
      return touchSession({ ...session, typing: false, typingStartedAt: undefined });
    }
    case "assistant_error": {
      return {
        ...appendLine(session, {
          id: newId(),
          kind: "error",
          text: `error: ${String(p.code ?? "ERROR")} - ${String(p.message ?? "unknown")}`,
          threadId: event.thread_id,
          sessionId: event.session_id,
        }),
        streamingMessageId: null,
        typing: false,
        typingStartedAt: undefined,
        typingClosed: true,
      };
    }
    default:
      return session;
  }
}

function normalizeButtons(value: unknown): AssistantButton[] {
  if (!Array.isArray(value)) return [];
  return value.map((button) => {
    const item = button as Record<string, unknown>;
    const style = item.style === "primary" || item.style === "danger" ? item.style : "secondary";
    return {
      id: String(item.id ?? ""),
      label: String(item.label ?? item.id ?? "Choose"),
      style,
    };
  });
}
