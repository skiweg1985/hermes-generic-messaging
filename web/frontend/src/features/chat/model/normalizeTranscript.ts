import type { ToolStatus, TranscriptLine } from "../../../types/events";
import type { ChatMessage, MessagePart } from "./messageTypes";
import { lineMessageRole, lineMessageStatus, lineToParts } from "./lineToPart";

function isUserAnchor(line: TranscriptLine): boolean {
  const kind = line.kind;
  if (kind === "user" || kind === "command") return true;
  if (line.role === "user" && line.turnMessageId && line.turnMessageId === line.id) return true;
  if (kind === "upload" && !line.turnMessageId) return true;
  return false;
}

function isUserAttachment(line: TranscriptLine): boolean {
  if (!line.turnMessageId || line.turnMessageId === line.id) return false;
  const kind = line.kind;
  if (line.role === "user") return true;
  return kind === "upload";
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
  const replySource = lines.find((l) => l.replyToLabel || l.replyToPreview);

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
      replyToLineId: replySource?.replyToLineId,
      replyToLabel: replySource?.replyToLabel,
      replyToPreview: replySource?.replyToPreview,
    },
  };
}

function parseToolStatus(value?: string): ToolStatus | undefined {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "running" || s === "pending" || s === "started" || s === "starting") return "running";
  if (s === "success" || s === "done" || s === "completed" || s === "complete" || s === "ok") {
    return "success";
  }
  if (s === "error" || s === "failed" || s === "failure" || s === "timeout") return "error";
  if (s === "idle" || s === "stale") return "idle";
  return undefined;
}

function isToolNotice(line: TranscriptLine): boolean {
  return line.kind === "notice" && (line.noticeKind ?? "").toLowerCase() === "tool";
}

function toolLineStatus(line: TranscriptLine): ToolStatus {
  return parseToolStatus(line.toolStatus) ?? (line.toolError ? "error" : line.toolResult ? "success" : "running");
}

function buildToolGroupMessage(lines: TranscriptLine[]): ChatMessage {
  const first = lines[0]!;
  const statuses = lines.map(toolLineStatus);
  const status: ToolStatus = statuses.includes("error")
    ? "error"
    : statuses.includes("running")
      ? "running"
      : statuses.includes("idle")
        ? "idle"
        : "success";
  const activeLine = [...lines].reverse().find((line) => toolLineStatus(line) === "running") ?? lines.at(-1)!;
  const rawText = lines.map((line) => line.text).filter(Boolean).join("\n");
  const parts: MessagePart[] =
    status === "idle"
      ? []
      : [
          {
            type: "tool_call",
            toolName: activeLine.toolName ?? "tool",
            status,
            summary: activeLine.text,
            args: activeLine.toolArgs,
            result: activeLine.toolResult,
            durationMs: activeLine.toolDurationMs,
            error: activeLine.toolError,
            rawText,
            lineId: activeLine.id,
          },
        ];

  return {
    messageId: first.id,
    role: "assistant",
    status: status === "error" ? "error" : status === "running" ? "streaming" : "done",
    parts,
    metadata: {
      threadId: first.threadId,
      sessionId: first.sessionId,
      turnMessageId: first.turnMessageId,
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
  let toolBuffer: TranscriptLine[] = [];

  const flushUser = () => {
    if (userBuffer.length === 0) return;
    messages.push(buildMessage(userBuffer, turnActive));
    userBuffer = [];
  };

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    messages.push(buildToolGroupMessage(toolBuffer));
    toolBuffer = [];
  };

  for (const line of filtered) {
    if (isUserAnchor(line) || isUserAttachment(line)) {
      flushTools();
      if (isUserAnchor(line) && userBuffer.length > 0) {
        flushUser();
      }
      userBuffer.push(line);
      continue;
    }

    flushUser();
    if (isToolNotice(line)) {
      toolBuffer.push(line);
      continue;
    }
    flushTools();
    messages.push(buildMessage([line], turnActive));
  }

  flushTools();
  flushUser();
  return messages;
}
