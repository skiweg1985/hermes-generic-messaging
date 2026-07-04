export type SchemaVersion = "v1";
export type PlatformName = "custom_chat";

export type InboundType =
  | "message.create"
  | "command.create"
  | "audio.uploaded"
  | "file.uploaded"
  | "message.cancel"
  | "button.click";

export type OutboundType =
  | "assistant_start"
  | "assistant_delta"
  | "assistant_done"
  | "assistant_segment"
  | "assistant_audio"
  | "assistant_error"
  | "assistant_buttons"
  | "assistant_notice"
  | "assistant_image"
  | "assistant_file"
  | "session_meta"
  | "typing";

export type NoticeKind = "info" | "tool" | "reasoning" | "warning" | "error";

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

export interface MessageAttachment {
  attachment_id: string;
  mime_type: string;
  size_bytes: number;
  url?: string;
  file_ref?: string;
  filename?: string;
}

export interface MessageCreatePayload {
  message_id: string;
  text: string;
  attachments?: MessageAttachment[];
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

export interface FileUploadedPayload {
  message_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  url?: string;
  file_ref?: string;
}

export interface MessageCancelPayload {
  target_message_id: string;
}

export interface ButtonClickPayload {
  message_id: string;
  confirm_id?: string;
  button_id: string;
  choice?: string;
  extra?: Record<string, unknown>;
}

export type ConnectionStatus = "connecting" | "connected" | "error";

export type ButtonStyle = "primary" | "secondary" | "danger";

export interface AssistantButton {
  id: string;
  label: string;
  style: ButtonStyle;
}

export type ToolStatus = "running" | "success" | "error" | "idle";

export type TranscriptLineKind =
  | "empty"
  | "user"
  | "command"
  | "upload"
  | "assistant"
  | "audio-out"
  | "buttons"
  | "notice"
  | "image"
  | "file"
  | "video"
  | "error";

export interface TranscriptLine {
  id: string;
  kind: TranscriptLineKind;
  role?: "user" | "assistant";
  text: string;
  title?: string;
  audioUrl?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  caption?: string;
  mimeType?: string;
  noticeKind?: string;
  buttons?: AssistantButton[];
  confirmId?: string;
  pickId?: string;
  commandBase?: string;
  buttonKind?: string;
  clickedButtonId?: string;
  threadId?: string;
  sessionId?: string;
  turnMessageId?: string;
  streaming?: boolean;
  interrupted?: boolean;
  reasoningText?: string;
  lastSequence?: number;
  toolName?: string;
  toolStatus?: ToolStatus;
  toolArgs?: string;
  toolResult?: string;
  toolDurationMs?: number;
  toolError?: string;
  videoUrl?: string;
  posterUrl?: string;
}

export interface ReplyTarget {
  lineId: string;
  role: "user" | "assistant" | "system";
  label: string;
  preview: string;
  quotedText?: string;
}

export interface SessionMetaPayload {
  title?: string;
  extra?: Record<string, unknown>;
}

export type PendingAttachmentStatus = "queued" | "uploading" | "done" | "error";

export interface PendingAttachment {
  localId: string;
  fileName: string;
  mimeType: string;
  status: PendingAttachmentStatus;
  error?: { code: string; message: string };
  result?: {
    url: string;
    mime_type: string;
    size_bytes: number;
    filename: string;
    attachment_id: string;
  };
}

export interface ChatSession {
  chatId: string;
  label: string;
  title?: string;
  sessionId?: string;
  threadId?: string;
  lines: TranscriptLine[];
  streamingMessageId: string | null;
  /** Internal turn/reply id for message.cancel (may differ from streamingMessageId after segments). */
  streamTurnId: string | null;
  typing: boolean;
  typingStartedAt?: string;
  typingClosed?: boolean;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatState {
  activeChatId: string;
  sessionsById: Record<string, ChatSession>;
  recording: boolean;
}
