import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WsClient } from "./wsClient";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1006, reason: "", wasClean: false });
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

let instances: MockWebSocket[] = [];

describe("WsClient", () => {
  it("sends reply context as structured fields without modifying user text", () => {
    const send = vi.fn();
    const previousWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = { OPEN: 1 };
    try {
      const client = new WsClient(() => undefined, () => undefined);
      (client as unknown as { ws: { readyState: number; send: (data: string) => void } }).ws = {
        readyState: 1,
        send,
      };

      const delivered = client.sendMessage(
        {
          messageId: "msg-1",
          text: "Yes, exactly",
          replyTarget: {
            lineId: "quoted-1",
            role: "assistant",
            label: "Hermes",
            preview: "Original assistant text",
            quotedText: "Original assistant text",
          },
        },
        "chat-1",
        "user-1",
      );

      expect(delivered).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      const envelope = JSON.parse(send.mock.calls[0]![0]) as {
        type: string;
        payload: Record<string, unknown>;
      };
      expect(envelope.type).toBe("message.create");
      expect(envelope.payload).toMatchObject({
        message_id: "msg-1",
        text: "Yes, exactly",
        reply_to_message_id: "quoted-1",
        reply_to_text: "Original assistant text",
      });
      expect(String(envelope.payload.text)).not.toContain("Replying to");
    } finally {
      (globalThis as any).WebSocket = previousWebSocket;
    }
  });

  describe("heartbeat", () => {
    const HEARTBEAT_INTERVAL_MS = 25_000;
    const HEARTBEAT_TIMEOUT_MS = 10_000;
    let previousWebSocket: typeof globalThis.WebSocket;
    let previousWindow: typeof globalThis.window;

    beforeEach(() => {
      vi.useFakeTimers();
      instances = [];
      previousWebSocket = globalThis.WebSocket;
      previousWindow = globalThis.window;
      (globalThis as any).WebSocket = MockWebSocket;
      (globalThis as any).window = { location: { protocol: "http:", host: "localhost:5173" } };
    });

    afterEach(() => {
      vi.useRealTimers();
      (globalThis as any).WebSocket = previousWebSocket;
      (globalThis as any).window = previousWindow;
    });

    it("sends a ping after the heartbeat interval and swallows the pong", () => {
      const onMessage = vi.fn();
      const client = new WsClient(onMessage, () => undefined);
      client.connect();
      const socket = instances[0]!;
      socket.open();

      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      expect(socket.sent).toHaveLength(1);
      expect(JSON.parse(socket.sent[0]!).type).toBe("ping");

      socket.emit({ type: "pong" });
      expect(onMessage).not.toHaveBeenCalled();

      // Pong cleared the timeout, so the link stays open.
      vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1);
      expect(socket.readyState).toBe(MockWebSocket.OPEN);
    });

    it("closes the socket when no pong arrives within the timeout", () => {
      const client = new WsClient(() => undefined, () => undefined);
      client.connect();
      const socket = instances[0]!;
      socket.open();

      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      expect(JSON.parse(socket.sent[0]!).type).toBe("ping");

      // No pong -> timeout fires -> socket is closed (triggering reconnect).
      vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS);
      expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    });

    it("stops the heartbeat after an intentional disconnect", () => {
      const client = new WsClient(() => undefined, () => undefined);
      client.connect();
      const socket = instances[0]!;
      socket.open();
      client.disconnect();

      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
      expect(socket.sent).toHaveLength(0);
    });
  });
});
