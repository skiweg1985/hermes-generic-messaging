import type { ButtonClickPayload, EventEnvelope, MessageAttachment } from "../types/events";
import { newId } from "../lib/uuid";

export type MessageHandler = (event: EventEnvelope) => void;
export type StatusHandler = (status: "connecting" | "connected" | "error") => void;

/** Diagnostics about the browser<->BFF link, surfaced on close/error. */
export interface WsCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
  retries: number;
  at: string;
}
export type CloseHandler = (info: WsCloseInfo) => void;

const CONNECT_TIMEOUT_MS = 10_000;

interface SendContext {
  threadId?: string;
  sessionId?: string;
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/chat`;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export class WsClient {
  private ws: WebSocket | null = null;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private onClose?: CloseHandler;
  private retries = 0;
  private maxRetries = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(onMessage: MessageHandler, onStatus: StatusHandler, onClose?: CloseHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onClose = onClose;
  }

  private nowIso(): string {
    return nowIso();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private closeSocket(): void {
    this.clearConnectTimer();
    if (!this.ws) return;
    const socket = this.ws;
    this.ws = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }

  connect(): void {
    this.clearReconnectTimer();
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }
    this.closeSocket();
    this.onStatus("connecting");
    const socket = new WebSocket(wsUrl());
    this.ws = socket;
    this.connectTimer = setTimeout(() => {
      if (this.ws !== socket || socket.readyState !== WebSocket.CONNECTING) return;
      this.onStatus("error");
      socket.close();
    }, CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      this.clearConnectTimer();
      this.retries = 0;
      this.onStatus("connected");
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as EventEnvelope;
        this.onMessage(data);
      } catch {
        /* ignore malformed */
      }
    };
    socket.onerror = () => {
      this.clearConnectTimer();
      this.onStatus("error");
    };
    socket.onclose = (ev) => {
      this.clearConnectTimer();
      if (this.ws === socket) this.ws = null;
      if (this.intentionalClose) {
        this.intentionalClose = false;
        return;
      }
      this.onClose?.({
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
        retries: this.retries,
        at: this.nowIso(),
      });
      if (this.retries < this.maxRetries) {
        this.retries += 1;
        const delay = Math.min(1000 * 2 ** this.retries, 8000);
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, delay);
      } else {
        this.onStatus("error");
      }
    };
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.intentionalClose = true;
    this.retries = this.maxRetries;
    this.closeSocket();
  }

  reconnect(): void {
    this.clearReconnectTimer();
    this.intentionalClose = true;
    this.closeSocket();
    this.retries = 0;
    this.intentionalClose = false;
    this.connect();
  }

  private send(envelope: Partial<EventEnvelope> & { type: string; payload: Record<string, unknown> }): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(envelope));
    return true;
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendText(text: string, chatId: string, userId: string, context: SendContext = {}): void {
    this.sendMessage({ messageId: newId(), text }, chatId, userId, context);
  }

  sendMessage(
    params: {
      messageId: string;
      text: string;
      attachments?: MessageAttachment[];
    },
    chatId: string,
    userId: string,
    context: SendContext = {},
  ): boolean {
    const payload: Record<string, unknown> = {
      message_id: params.messageId,
      text: params.text,
    };
    if (params.attachments && params.attachments.length > 0) {
      payload.attachments = params.attachments;
    }
    return this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      thread_id: context.threadId,
      session_id: context.sessionId,
      type: "message.create",
      payload,
    });
  }

  sendCommand(command: string, chatId: string, userId: string, context: SendContext = {}): void {
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      thread_id: context.threadId,
      session_id: context.sessionId,
      type: "command.create",
      payload: { message_id: newId(), command },
    });
  }

  sendAudioUploaded(
    payload: {
      message_id: string;
      mime_type: string;
      size_bytes: number;
      url: string;
      filename?: string;
    },
    chatId: string,
    userId: string,
    context: SendContext = {},
  ): boolean {
    return this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      thread_id: context.threadId,
      session_id: context.sessionId,
      type: "audio.uploaded",
      payload: {
        message_id: payload.message_id,
        mime_type: payload.mime_type,
        size_bytes: payload.size_bytes,
        url: payload.url,
      },
    });
  }

  sendFileUploaded(
    payload: {
      message_id: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
      url: string;
    },
    chatId: string,
    userId: string,
    context: SendContext = {},
  ): boolean {
    return this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      thread_id: context.threadId,
      session_id: context.sessionId,
      type: "file.uploaded",
      payload,
    });
  }

  sendCancel(targetMessageId: string, chatId: string, userId: string, context: SendContext = {}): void {
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      thread_id: context.threadId,
      session_id: context.sessionId,
      type: "message.cancel",
      payload: { target_message_id: targetMessageId },
    });
  }

  sendButtonClick(
    payload: ButtonClickPayload,
    chatId: string,
    userId: string,
    context: SendContext = {},
  ): void {
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      thread_id: context.threadId,
      session_id: context.sessionId,
      type: "button.click",
      payload: { ...payload },
    });
  }
}
