export type SchemaVersion = "v1";
export type PlatformName = "custom_chat";

export type InboundType =
  | "message.create"
  | "command.create"
  | "audio.uploaded"
  | "message.cancel";

export type OutboundType =
  | "assistant_start"
  | "assistant_delta"
  | "assistant_done"
  | "assistant_audio"
  | "assistant_error";

export interface EventEnvelope {
  schema_version: SchemaVersion;
  event_id: string;
  timestamp: string;
  platform: PlatformName;
  chat_id: string;
  user_id: string;
  thread_id?: string;
  session_id?: string;
  type: InboundType | OutboundType | string;
  payload: Record<string, unknown>;
}

export interface MessageCreatePayload {
  message_id: string;
  text: string;
  idempotency_key?: string;
}

export interface CommandCreatePayload {
  message_id: string;
  command: string;
}

export interface AudioUploadedPayload {
  message_id: string;
  mime_type: string;
  size_bytes: number;
  url?: string;
  file_ref?: string;
}

export interface MessageCancelPayload {
  target_message_id: string;
}

export type ConnectionStatus = "connecting" | "connected" | "error";

export type TranscriptLineKind =
  | "empty"
  | "user"
  | "command"
  | "upload"
  | "assistant"
  | "audio-out"
  | "error";

export interface TranscriptLine {
  id: string;
  kind: TranscriptLineKind;
  text: string;
  audioUrl?: string;
  mimeType?: string;
  streaming?: boolean;
}

export interface ChatState {
  connection: ConnectionStatus;
  sessionLabel: string;
  lines: TranscriptLine[];
  streamingMessageId: string | null;
  input: string;
  recording: boolean;
}
