import type { TranscriptLine } from "../../../types/events";
import type { ChatMessage, MessageTurn } from "./messageTypes";
import { normalizeTranscript } from "./normalizeTranscript";
import { lineMessageRole } from "./lineToPart";

function isUserMessage(msg: ChatMessage): boolean {
  return msg.role === "user";
}

export function groupMessages(messages: ChatMessage[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let current: MessageTurn | null = null;

  for (const message of messages) {
    if (isUserMessage(message)) {
      if (current) turns.push(current);
      current = { id: message.messageId, user: message, outputs: [] };
      continue;
    }

    if (!current) {
      current = { id: `orphan-${message.messageId}`, user: null, outputs: [message] };
      continue;
    }

    current.outputs.push(message);
  }

  if (current) turns.push(current);
  return turns;
}

/** Group flat transcript lines into turns via normalized messages. */
export function groupTurnsFromLines(lines: TranscriptLine[]): MessageTurn[] {
  const hasStreaming = lines.some((l) => l.streaming);
  const messages = normalizeTranscript(lines, { turnActive: hasStreaming });
  return groupMessages(messages);
}

/** Legacy-compatible: also export for turnGrouping tests */
export function isUserAnchorLine(line: TranscriptLine): boolean {
  return lineMessageRole(line) === "user" && (
    line.kind === "user" ||
    line.kind === "command" ||
    line.kind === "upload" ||
    Boolean(line.turnMessageId && line.turnMessageId === line.id) ||
    line.role === "user"
  );
}
