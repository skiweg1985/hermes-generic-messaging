import type { AssistantButton, ToolStatus } from "../../../types/events";

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "pending" | "streaming" | "done" | "error" | "interrupted";

export interface MessageMetadata {
  threadId?: string;
  sessionId?: string;
  turnMessageId?: string;
  title?: string;
  interrupted?: boolean;
  lineIds: string[];
  replyToLineId?: string;
  replyToLabel?: string;
  replyToPreview?: string;
}

export type MessagePart =
  | { type: "text"; text: string; streaming?: boolean; command?: boolean }
  | { type: "reasoning"; text: string; active?: boolean }
  | {
      type: "tool_call";
      toolName: string;
      status: ToolStatus;
      summary?: string;
      args?: string;
      result?: string;
      durationMs?: number;
      error?: string;
      detail?: string;
      rawText?: string;
      lineId: string;
    }
  | {
      type: "image";
      url: string;
      caption?: string;
      mimeType?: string;
      downloadUrl?: string;
      fileName?: string;
      lineId: string;
    }
  | {
      type: "file";
      url: string;
      fileName: string;
      mimeType?: string;
      sizeBytes?: number;
      lineId: string;
    }
  | {
      type: "audio";
      url: string;
      fileName?: string;
      mimeType?: string;
      downloadUrl?: string;
      caption?: string;
      lineId: string;
    }
  | {
      type: "video";
      url: string;
      fileName?: string;
      mimeType?: string;
      posterUrl?: string;
      lineId: string;
    }
  | { type: "error"; code: string; message: string; lineId: string }
  | {
      type: "buttons";
      title?: string;
      body: string;
      buttons: AssistantButton[];
      confirmId?: string;
      pickId?: string;
      commandBase?: string;
      buttonKind?: string;
      clickedButtonId?: string;
      lineId: string;
    }
  | { type: "notice"; text: string; noticeKind: string; lineId: string };

export interface ChatMessage {
  messageId: string;
  role: MessageRole;
  status: MessageStatus;
  parts: MessagePart[];
  metadata: MessageMetadata;
}

export interface MessageTurn {
  id: string;
  user: ChatMessage | null;
  outputs: ChatMessage[];
}
