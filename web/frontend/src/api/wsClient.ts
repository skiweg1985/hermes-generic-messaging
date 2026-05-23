import type { EventEnvelope } from "../types/events";
import { newId } from "../lib/uuid";

export type MessageHandler = (event: EventEnvelope) => void;
export type StatusHandler = (status: "connecting" | "connected" | "error") => void;

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
  private retries = 0;
  private maxRetries = 3;

  constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(): void {
    this.onStatus("connecting");
    this.ws = new WebSocket(wsUrl());
    this.ws.onopen = () => {
      this.retries = 0;
      this.onStatus("connected");
    };
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as EventEnvelope;
        this.onMessage(data);
      } catch {
        /* ignore malformed */
      }
    };
    this.ws.onerror = () => this.onStatus("error");
    this.ws.onclose = () => {
      if (this.retries < this.maxRetries) {
        this.retries += 1;
        const delay = Math.min(1000 * 2 ** this.retries, 8000);
        setTimeout(() => this.connect(), delay);
      } else {
        this.onStatus("error");
      }
    };
  }

  disconnect(): void {
    this.retries = this.maxRetries;
    this.ws?.close();
    this.ws = null;
  }

  reconnect(): void {
    this.disconnect();
    this.retries = 0;
    this.connect();
  }

  private send(envelope: Partial<EventEnvelope> & { type: string; payload: Record<string, unknown> }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(envelope));
  }

  sendText(text: string, chatId: string, userId: string): void {
    const messageId = newId();
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      type: "message.create",
      payload: { message_id: messageId, text },
    });
  }

  sendCommand(command: string, chatId: string, userId: string): void {
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      type: "command.create",
      payload: { message_id: newId(), command },
    });
  }

  sendAudioUploaded(
    payload: { message_id: string; mime_type: string; size_bytes: number; url: string },
    chatId: string,
    userId: string,
  ): void {
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      type: "audio.uploaded",
      payload,
    });
  }

  sendCancel(targetMessageId: string, chatId: string, userId: string): void {
    this.send({
      schema_version: "v1",
      event_id: newId(),
      timestamp: nowIso(),
      platform: "custom_chat",
      chat_id: chatId,
      user_id: userId,
      type: "message.cancel",
      payload: { target_message_id: targetMessageId },
    });
  }
}
