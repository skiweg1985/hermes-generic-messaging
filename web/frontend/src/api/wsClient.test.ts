import { describe, expect, it, vi } from "vitest";
import { WsClient } from "./wsClient";

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
});
