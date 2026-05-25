import type { TranscriptLine } from "../../../types/events";
import type { ChatMessage, MessagePart } from "./messageTypes";
import { lineMessageRole, lineMessageStatus, lineToParts } from "./lineToPart";

function isUserAnchor(line: TranscriptLine): boolean {
  const kind = line.kind;
  if (kind === "user" || kind === "command") return true;
  if (line.turnMessageId && line.turnMessageId === line.id) return true;
  if (kind === "upload" && !line.turnMessageId) return true;
  return false;
}

function isUserAttachment(line: TranscriptLine): boolean {
  if (!line.turnMessageId || line.turnMessageId === line.id) return false;
  const kind = line.kind;
  return (
    line.role === "user" ||
    kind === "upload" ||
    kind === "image" ||
    kind === "audio-out" ||
    kind === "video"
  );
}

function buildMessage(lines: TranscriptLine[], turnActive: boolean): ChatMessage {
  const first = lines[0]!;
  const role = lineMessageRole(first);
  let status = lineMessageStatus(first);
  const parts: MessagePart[] = [];

  for (const line of lines) {
    const lineStatus = lineMessageStatus(line);
    if (lineStatus === "streaming") status = "streaming";
    else if (lineStatus === "error") status = "error";
    else if (lineStatus === "interrupted") status = "interrupted";
    parts.push(...lineToParts(line, turnActive));
  }

  const messageId = first.turnMessageId && role === "user" ? first.turnMessageId : first.id;

  return {
    messageId,
    role,
    status,
    parts,
    metadata: {
      threadId: first.threadId,
      sessionId: first.sessionId,
      turnMessageId: first.turnMessageId,
      title: lines.find((l) => l.title)?.title,
      interrupted: lines.some((l) => l.interrupted),
      lineIds: lines.map((l) => l.id),
    },
  };
}

export function normalizeTranscript(
  lines: TranscriptLine[],
  options?: { turnActive?: boolean },
): ChatMessage[] {
  const turnActive = options?.turnActive ?? false;
  const filtered = lines.filter((l) => l.kind !== "empty");
  const messages: ChatMessage[] = [];
  let userBuffer: TranscriptLine[] = [];

  const flushUser = () => {
    if (userBuffer.length === 0) return;
    messages.push(buildMessage(userBuffer, turnActive));
    userBuffer = [];
  };

  for (const line of filtered) {
    if (isUserAnchor(line) || isUserAttachment(line)) {
      if (isUserAnchor(line) && userBuffer.length > 0) {
        flushUser();
      }
      userBuffer.push(line);
      continue;
    }

    flushUser();
    messages.push(buildMessage([line], turnActive));
  }

  flushUser();
  return messages;
}
