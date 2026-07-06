import type {
  AssistantButton,
  ChatSession,
  ChatState,
  EventEnvelope,
  ToolStatus,
  TranscriptLine,
} from "../../types/events";
import { newId } from "../../lib/uuid";
import { mergeChatStates } from "./sessionPersistence";

const MAX_LABEL_LENGTH = 18;
const MAX_TITLE_LENGTH = 40;

export const DEFAULT_CHAT_ID = "workspace:demo";

function truncate(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

export function resolveCancelTargetId(session: ChatSession): string | null {
  return session.streamTurnId ?? session.streamingMessageId;
}

export function chatDisplayTitle(session: ChatSession): string {
  if (session.title && session.title.trim().length > 0) {
    return truncate(session.title, MAX_TITLE_LENGTH);
  }
  const firstUserLine = session.lines.find((line) =>
    ["user", "command", "audio-out", "upload"].includes(line.kind) && line.role !== "assistant",
  );
  if (firstUserLine?.text.trim()) {
    const clean = firstUserLine.text
      .replace(/^user>\s*/i, "")
      .replace("[voice]", "Voice message");
    return truncate(clean, MAX_TITLE_LENGTH);
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
    streamTurnId: null,
    typing: false,
    typingClosed: false,
    unread: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface ReplyContext {
  lineId: string;
  label: string;
  preview: string;
}

function replyLineFields(replyTo?: ReplyContext): Partial<TranscriptLine> {
  if (!replyTo) return {};
  return {
    replyToLineId: replyTo.lineId,
    replyToLabel: replyTo.label,
    replyToPreview: replyTo.preview,
  };
}

export const initialChatState = (
  chatId = DEFAULT_CHAT_ID,
  label = "New chat",
): ChatState => {
  const session = createChatSession(chatId, label);
  return {
    activeChatId: chatId,
    sessionsById: { [chatId]: session },
    recording: false,
  };
};

export type ChatAction =
  | { type: "HYDRATE_STATE"; state: ChatState }
  | { type: "SET_ACTIVE_CHAT"; chatId: string }
  | { type: "CREATE_CHAT"; chatId: string; label?: string }
  | { type: "DELETE_LINE_LOCAL"; chatId?: string; lineId: string }
  | { type: "SET_RECORDING"; recording: boolean }
  | { type: "USER_TEXT"; text: string; turnMessageId?: string; chatId?: string }
  | { type: "USER_COMMAND"; command: string; chatId?: string }
  | {
      type: "USER_VOICE";
      turnMessageId: string;
      attachmentId: string;
      mime: string;
      size: number;
      url: string;
      chatId?: string;
      replyTo?: ReplyContext;
    }
  | {
      type: "USER_MESSAGE";
      turnMessageId: string;
      text: string;
      attachments: Array<{
        attachmentId: string;
        filename: string;
        mime: string;
        size: number;
        url: string;
      }>;
      chatId?: string;
      replyTo?: ReplyContext;
    }
  | { type: "USER_UPLOAD"; filename: string; mime: string; size: number; url?: string; chatId?: string; turnMessageId?: string }
  | { type: "USER_ERROR"; code: string; message: string; chatId?: string }
  | { type: "BUTTON_CLICKED"; chatId: string; lineId: string; buttonId: string }
  | { type: "CLEAR_TYPING"; chatId: string }
  | { type: "INBOUND_EVENT"; event: EventEnvelope };

const DELTA_BUFFER_CAP = 64;

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

function findAssistantLineIndex(lines: TranscriptLine[], messageId: string): number {
  return lines.findIndex((l) => l.id === messageId && l.kind === "assistant");
}

function markUnread(state: ChatState, chatId: string): ChatState {
  if (chatId === state.activeChatId) return state;
  return updateSession(state, chatId, (session) => ({ ...session, unread: true }));
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "HYDRATE_STATE":
      // Merge the remote snapshot against the *current* reducer state (not a
      // caller-captured snapshot) so events dispatched while the fetch was in
      // flight are not clobbered.
      return {
        ...mergeChatStates(state, action.state),
        recording: state.recording,
      };
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
    case "DELETE_LINE_LOCAL":
      return updateSession(state, action.chatId ?? state.activeChatId, (session) => {
        const lines = session.lines.filter((line) => line.id !== action.lineId);
        return touchSession({ ...session, lines });
      });
    case "SET_RECORDING":
      return { ...state, recording: action.recording };
    case "USER_TEXT":
      return updateSession(state, action.chatId ?? state.activeChatId, (session) =>
        appendLine(openTyping(session), {
          id: action.turnMessageId ?? newId(),
          kind: "user",
          text: action.text,
          turnMessageId: action.turnMessageId,
        }),
      );
    case "USER_MESSAGE": {
      const { turnMessageId, text, attachments } = action;
      return updateSession(state, action.chatId ?? state.activeChatId, (session) => {
        let next: ChatSession = openTyping(session);
        let replyFields = replyLineFields(action.replyTo);
        if (text.trim()) {
          next = appendLine(next, {
            id: turnMessageId,
            kind: "user",
            text: text.trim(),
            turnMessageId,
            ...replyFields,
          });
          replyFields = {};
        }
        for (const att of attachments) {
          next = appendLine(next, {
            ...buildAttachmentLine({
              id: att.attachmentId,
              role: "user",
              filename: att.filename,
              mime: att.mime,
              size: att.size,
              url: att.url,
              turnMessageId,
            }),
            ...replyFields,
          });
          replyFields = {};
        }
        return next;
      });
    }
    case "USER_COMMAND":
      return updateSession(state, action.chatId ?? state.activeChatId, (session) =>
        appendLine(openTyping(session), {
          id: newId(),
          kind: "command",
          text: action.command,
        }),
      );
    case "USER_VOICE":
      return updateSession(state, action.chatId ?? state.activeChatId, (session) =>
        appendLine(openTyping(session), {
          id: action.attachmentId,
          kind: "audio-out",
          role: "user",
          text: "user> [voice]",
          audioUrl: action.url,
          fileUrl: action.url,
          sizeBytes: action.size,
          mimeType: action.mime,
          turnMessageId: action.turnMessageId,
          ...replyLineFields(action.replyTo),
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
            turnMessageId: action.turnMessageId,
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

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

function parseToolStatus(value: unknown): ToolStatus | undefined {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "running" || s === "pending" || s === "started" || s === "starting") {
    return "running";
  }
  if (s === "success" || s === "done" || s === "completed" || s === "complete" || s === "ok") {
    return "success";
  }
  if (s === "error" || s === "failed" || s === "failure" || s === "timeout") {
    return "error";
  }
  if (s === "idle" || s === "stale") return "idle";
  return undefined;
}

/**
 * Applies a streaming delta to a line, buffering out-of-order chunks in the
 * line's own `pendingDeltas` map. Pure: never mutates shared state, so React's
 * StrictMode double-invocation of the reducer is safe and abandoned buffers are
 * garbage-collected with the line/session instead of leaking module-globally.
 */
function applyDeltaToLine(
  line: TranscriptLine,
  delta: string,
  sequence?: number,
): TranscriptLine {
  if (sequence == null || !Number.isFinite(sequence)) {
    return { ...line, text: line.text + delta, streaming: true };
  }

  const seq = Math.floor(sequence);
  const last = line.lastSequence ?? 0;

  if (seq <= last) {
    return line;
  }

  if (seq === last + 1) {
    const pending = { ...(line.pendingDeltas ?? {}) };
    let text = line.text + delta;
    let cursor = seq + 1;
    while (pending[cursor] != null) {
      text += pending[cursor];
      delete pending[cursor];
      cursor += 1;
    }
    return {
      ...line,
      text,
      streaming: true,
      lastSequence: cursor - 1,
      pendingDeltas: Object.keys(pending).length > 0 ? pending : undefined,
    };
  }

  const pending = { ...(line.pendingDeltas ?? {}) };
  if (Object.keys(pending).length >= DELTA_BUFFER_CAP) {
    // Reorder buffer full — apply directly rather than growing unbounded.
    return { ...line, text: line.text + delta, streaming: true, lastSequence: seq };
  }
  pending[seq] = delta;
  return { ...line, pendingDeltas: pending };
}

function flushDeltaBuffer(line: TranscriptLine): TranscriptLine {
  const pending = line.pendingDeltas;
  if (!pending) return line;
  const keys = Object.keys(pending)
    .map(Number)
    .sort((a, b) => a - b);
  let text = line.text;
  let last = line.lastSequence ?? 0;
  for (const seq of keys) {
    if (seq > last) {
      text += pending[seq];
      last = seq;
    }
  }
  return { ...line, text, lastSequence: last, pendingDeltas: undefined };
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
  turnMessageId?: string;
}): TranscriptLine {
  const { id, role, filename, mime, size, url, threadId, sessionId, turnMessageId } = params;
  const label = fileLabel(filename, mime, size);
  const base = { threadId, sessionId, turnMessageId };
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
      ...base,
    };
  }
  if (isAudioMime(mime)) {
    return {
      id,
      kind: "audio-out",
      role,
      text: "",
      audioUrl: url,
      fileName: filename,
      fileUrl: url,
      sizeBytes: size,
      mimeType: mime,
      ...base,
    };
  }
  if (isVideoMime(mime)) {
    return {
      id,
      kind: "video",
      role,
      text: label,
      videoUrl: url,
      fileUrl: url,
      fileName: filename,
      sizeBytes: size,
      mimeType: mime,
      ...base,
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
    ...base,
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

function finalizeRunningToolNotices(
  lines: TranscriptLine[],
  status: ToolStatus,
  turnMessageId?: string,
  streamingMessageId?: string | null,
): TranscriptLine[] {
  return lines.map((line) => {
    if (line.kind !== "notice" || line.noticeKind !== "tool") return line;
    if (line.toolStatus !== "running") return line;
    if (turnMessageId || streamingMessageId) {
      const sameTurn =
        !line.turnMessageId ||
        line.turnMessageId === turnMessageId ||
        line.id === streamingMessageId ||
        line.id === turnMessageId ||
        (turnMessageId ? line.id.startsWith(`${turnMessageId}-`) : false);
      if (!sameTurn) return line;
    }
    return { ...line, toolStatus: status };
  });
}

function reduceSessionInbound(session: ChatSession, event: EventEnvelope): ChatSession {
  // Defensive: a malformed or unexpected frame may lack `payload`. Never
  // dereference it unguarded — this reducer runs in React's render phase where
  // a throw would unmount the whole app (there is no error boundary above it).
  const p: Record<string, unknown> =
    event.payload && typeof event.payload === "object" ? event.payload : {};
  switch (event.type) {
    case "assistant_start": {
      const messageId = String(p.message_id ?? newId());
      const turnMessageId =
        p.turn_message_id != null ? String(p.turn_message_id) : undefined;
      const streamTurnId = turnMessageId ?? messageId;
      const existing = session.lines.find((line) => line.id === messageId);
      // Preserve accumulated stream state on a replayed/duplicate start (e.g.
      // reconnect re-emitting the turn). Dropping lastSequence/pendingDeltas
      // would reset delta dedup and re-append already-rendered text.
      const line: TranscriptLine = existing
        ? {
            ...existing,
            kind: "assistant",
            turnMessageId,
            threadId: event.thread_id ?? existing.threadId,
            sessionId: event.session_id ?? existing.sessionId,
            streaming: true,
          }
        : {
            id: messageId,
            kind: "assistant",
            text: "",
            turnMessageId,
            threadId: event.thread_id,
            sessionId: event.session_id,
            streaming: true,
          };
      return {
        ...upsertLine(
          { ...withoutTyping(session), streamingMessageId: messageId, streamTurnId },
          line,
        ),
        streamingMessageId: messageId,
        streamTurnId,
        typing: false,
        typingStartedAt: undefined,
      };
    }
    case "assistant_delta": {
      if (p.message_id == null) return session;
      const messageId = String(p.message_id);
      const delta = String(p.delta ?? "");
      const sequence = p.sequence != null ? Number(p.sequence) : undefined;
      const idx = findAssistantLineIndex(session.lines, messageId);
      if (idx < 0) {
        const line = applyDeltaToLine(
          {
            id: messageId,
            kind: "assistant",
            text: "",
            threadId: event.thread_id,
            sessionId: event.session_id,
            streaming: true,
          },
          delta,
          sequence,
        );
        return appendLine(
          { ...withoutTyping(session), streamingMessageId: messageId },
          line,
        );
      }
      const existing = session.lines[idx]!;
      if (!existing.streaming && session.streamingMessageId !== messageId) {
        return session;
      }
      const nextLine = applyDeltaToLine(existing, delta, sequence);
      if (nextLine === existing) return session;
      const lines = [...session.lines];
      lines[idx] = nextLine;
      return touchSession({ ...withoutTyping(session), lines, streamingMessageId: messageId });
    }
    case "assistant_segment": {
      if (p.message_id == null) return session;
      const turnMessageId = String(p.message_id);
      const segmentMessageId = String(p.segment_message_id ?? newId());
      const label = p.label != null ? String(p.label) : undefined;
      // Duplicate delivery (reconnect replay) of the same segment must not add a
      // second line with an identical id.
      if (session.lines.some((l) => l.id === segmentMessageId)) {
        return session;
      }
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
        streamTurnId: session.streamTurnId ?? turnMessageId,
      });
      return nextSession;
    }
    case "assistant_done": {
      if (p.message_id == null) return session;
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
        const line = flushDeltaBuffer(lines[idx]!);
        lines[idx] = {
          ...line,
          text: finalText ?? line.text,
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
      const belongsToActiveStream =
        session.streamingMessageId === messageId ||
        session.streamTurnId === messageId ||
        lines.some((line) => line.id === messageId && line.turnMessageId === session.streamTurnId);
      return touchSession({
        ...(belongsToActiveStream ? withoutTyping(session) : session),
        lines: finalizeRunningToolNotices(
          lines,
          interrupted ? "idle" : "success",
          belongsToActiveStream ? (session.streamTurnId ?? messageId) : messageId,
          messageId,
        ),
        streamingMessageId: belongsToActiveStream ? null : session.streamingMessageId,
        streamTurnId: belongsToActiveStream ? null : session.streamTurnId,
        typingClosed: belongsToActiveStream ? true : session.typingClosed,
      });
    }
    case "assistant_audio": {
      const messageId = String(p.message_id ?? newId());
      const url = String(p.url ?? p.file_ref ?? "");
      const mime = String(p.mime_type ?? "audio/mpeg");
      const lines = finalizeStreamingLines(
        session.lines,
        messageId,
        session.streamingMessageId,
      );
      return upsertLine(
        {
          ...withoutTyping(session),
          lines,
          streamingMessageId: null,
          streamTurnId: null,
          typingClosed: true,
        },
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
      const toolStatus =
        parseToolStatus(p.status) ??
        (p.error != null ? "error" : p.result != null ? "success" : undefined);
      const line: TranscriptLine = {
        id: messageId,
        kind: "notice",
        text: String(p.text ?? ""),
        noticeKind,
        threadId: event.thread_id,
        sessionId: event.session_id,
        toolName: p.tool_name != null ? String(p.tool_name) : undefined,
        toolStatus,
        toolArgs: p.args != null ? String(p.args) : undefined,
        toolResult: p.result != null ? String(p.result) : undefined,
        toolDurationMs:
          p.duration_ms != null ? Number(p.duration_ms) : undefined,
        toolError: p.error != null ? String(p.error) : undefined,
        turnMessageId: p.turn_message_id != null ? String(p.turn_message_id) : session.streamTurnId ?? undefined,
      };
      const upsert = noticeKind === "tool" || noticeKind === "reasoning";
      return (upsert ? upsertLine : appendLine)(withoutTyping(session), line);
    }
    case "assistant_image": {
      const messageId = String(p.message_id ?? newId());
      const imageUrl = String(p.url ?? "");
      // Upsert by id so a duplicate/replayed delivery does not add a second
      // identical image line (also avoids duplicate React keys in turnGrouping).
      return upsertLine(
        withoutTyping(session),
        {
          id: messageId,
          kind: "image",
          role: "assistant",
          text: String(p.caption ?? ""),
          imageUrl,
          fileUrl: imageUrl,
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
      // Upsert by id so a duplicate/replayed delivery does not add a second
      // identical file line.
      return upsertLine(
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
        // Suppress a stray/reordered typing:start after the turn already
        // completed (assistant_done sets typingClosed). Reset by the next user
        // turn via openTyping — otherwise a finished chat flashes "typing…".
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
      const messageId = p.message_id != null ? String(p.message_id) : undefined;
      const belongsToActiveStream =
        !messageId || session.streamingMessageId === messageId || session.streamTurnId === messageId;
      // Clear `streaming` on the errored turn's lines so a late delta cannot
      // resurrect the stream and remote hydrate is no longer blocked forever.
      const clearedLines = belongsToActiveStream
        ? finalizeStreamingLines(
            session.lines,
            session.streamTurnId ?? messageId ?? "",
            session.streamingMessageId,
          )
        : session.lines;
      return {
        ...appendLine({
          ...session,
          lines: finalizeRunningToolNotices(
            clearedLines,
            "error",
            belongsToActiveStream ? (session.streamTurnId ?? messageId) : messageId,
            messageId ?? null,
          ),
        }, {
          id: newId(),
          kind: "error",
          text: `error: ${String(p.code ?? "ERROR")} - ${String(p.message ?? "unknown")}`,
          threadId: event.thread_id,
          sessionId: event.session_id,
        }),
        streamingMessageId: belongsToActiveStream ? null : session.streamingMessageId,
        streamTurnId: belongsToActiveStream ? null : session.streamTurnId,
        typing: belongsToActiveStream ? false : session.typing,
        typingStartedAt: belongsToActiveStream ? undefined : session.typingStartedAt,
        typingClosed: belongsToActiveStream ? true : session.typingClosed,
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
