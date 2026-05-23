import type { ChatState, EventEnvelope, TranscriptLine } from "../../types/events";
import { newId } from "../../lib/uuid";

export const initialChatState = (sessionLabel: string): ChatState => ({
  connection: "connecting",
  sessionLabel,
  lines: [],
  streamingMessageId: null,
  input: "",
  recording: false,
});

export type ChatAction =
  | { type: "SET_CONNECTION"; connection: ChatState["connection"] }
  | { type: "SET_INPUT"; input: string }
  | { type: "SET_RECORDING"; recording: boolean }
  | { type: "USER_TEXT"; text: string }
  | { type: "USER_COMMAND"; command: string }
  | { type: "USER_UPLOAD"; filename: string; mime: string; size: number }
  | { type: "USER_ERROR"; code: string; message: string }
  | { type: "INBOUND_EVENT"; event: EventEnvelope };

function appendLine(state: ChatState, line: TranscriptLine): ChatState {
  const lines = state.lines.filter((l) => l.kind !== "empty");
  return { ...state, lines: [...lines, line] };
}

function findAssistantLineIndex(lines: TranscriptLine[], messageId: string): number {
  return lines.findIndex((l) => l.id === messageId && l.kind === "assistant");
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_CONNECTION":
      return { ...state, connection: action.connection };
    case "SET_INPUT":
      return { ...state, input: action.input };
    case "SET_RECORDING":
      return { ...state, recording: action.recording };
    case "USER_TEXT":
      return appendLine(state, {
        id: newId(),
        kind: "user",
        text: action.text,
      });
    case "USER_COMMAND":
      return appendLine(state, {
        id: newId(),
        kind: "command",
        text: action.command,
      });
    case "USER_UPLOAD":
      return appendLine(state, {
        id: newId(),
        kind: "upload",
        text: `[upload] ${action.filename} (${action.mime}, ${formatSize(action.size)})`,
      });
    case "USER_ERROR":
      return appendLine(state, {
        id: newId(),
        kind: "error",
        text: `error: ${action.code} — ${action.message}`,
      });
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

function reduceInbound(state: ChatState, event: EventEnvelope): ChatState {
  const p = event.payload;
  switch (event.type) {
    case "assistant_start": {
      const messageId = String(p.message_id ?? newId());
      return {
        ...appendLine(
          { ...state, streamingMessageId: messageId },
          {
            id: messageId,
            kind: "assistant",
            text: "",
            streaming: true,
          },
        ),
        streamingMessageId: messageId,
      };
    }
    case "assistant_delta": {
      const messageId = String(p.message_id);
      const delta = String(p.delta ?? "");
      const idx = findAssistantLineIndex(state.lines, messageId);
      if (idx < 0) {
        return appendLine(
          { ...state, streamingMessageId: messageId },
          { id: messageId, kind: "assistant", text: delta, streaming: true },
        );
      }
      const lines = [...state.lines];
      const line = lines[idx];
      lines[idx] = { ...line, text: line.text + delta, streaming: true };
      return { ...state, lines, streamingMessageId: messageId };
    }
    case "assistant_done": {
      const messageId = String(p.message_id);
      const finalText = p.final_text != null ? String(p.final_text) : undefined;
      const idx = findAssistantLineIndex(state.lines, messageId);
      let lines = state.lines;
      if (idx >= 0) {
        lines = [...lines];
        lines[idx] = {
          ...lines[idx],
          text: finalText ?? lines[idx].text,
          streaming: false,
        };
      }
      return { ...state, lines, streamingMessageId: null };
    }
    case "assistant_audio": {
      const messageId = String(p.message_id ?? newId());
      const url = String(p.url ?? p.file_ref ?? "");
      return appendLine(
        { ...state, streamingMessageId: null },
        {
          id: messageId,
          kind: "audio-out",
          text: "assistant> [audio]",
          audioUrl: url,
          mimeType: String(p.mime_type ?? "audio/mpeg"),
        },
      );
    }
    case "assistant_error": {
      return {
        ...appendLine(state, {
          id: newId(),
          kind: "error",
          text: `error: ${String(p.code ?? "ERROR")} — ${String(p.message ?? "unknown")}`,
        }),
        streamingMessageId: null,
      };
    }
    default:
      return state;
  }
}
