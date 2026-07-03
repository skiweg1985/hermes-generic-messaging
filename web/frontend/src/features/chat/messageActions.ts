import type { ReplyTarget, TranscriptLine } from "../../types/events";

export type MessageActionId =
  | "copy"
  | "reply"
  | "retry"
  | "delete"
  | "download"
  | "inspect";

export interface MessageActionTarget {
  line: TranscriptLine;
  x?: number;
  y?: number;
}

function compact(value: string, max = 160): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}...`;
}

export function transcriptLineRole(line: TranscriptLine): ReplyTarget["role"] {
  if (line.role === "user" || line.kind === "user" || line.kind === "command") {
    return "user";
  }
  if (line.kind === "error") return "system";
  return "assistant";
}

export function transcriptLineLabel(line: TranscriptLine): string {
  const role = transcriptLineRole(line);
  if (role === "user") return "You";
  if (role === "system") return "System";
  if (line.noticeKind === "tool" || line.toolName) return "Tool";
  return "Hermes";
}

export function transcriptLinePreview(line: TranscriptLine): string {
  if (line.kind === "audio-out") return "Voice message";
  if (line.kind === "image") return compact(line.caption || line.text || "Image");
  if (line.kind === "video") return compact(line.caption || line.text || "Video");
  if (line.kind === "file" || line.kind === "upload") {
    return compact(line.fileName || line.text || "File");
  }
  if (line.kind === "buttons") return compact(line.title || line.text || "Action");
  if (line.noticeKind === "tool" || line.toolName) {
    return compact(line.toolName || line.text || "Tool call");
  }
  return compact(line.text || line.title || "Message");
}

export function transcriptLineCopyText(line: TranscriptLine): string {
  const url = downloadableUrlForLine(line);
  if (line.text.trim()) return line.text.trim();
  if (url) return url;
  return transcriptLinePreview(line);
}

export function replyTargetFromLine(line: TranscriptLine): ReplyTarget {
  const preview = transcriptLinePreview(line);
  const quotedText = transcriptLineCopyText(line);
  return {
    lineId: line.id,
    role: transcriptLineRole(line),
    label: transcriptLineLabel(line),
    preview,
    quotedText,
  };
}

export function withReplyPrefix(text: string, target?: ReplyTarget): string {
  const raw = text.trim();
  if (!target) return raw;
  const quote = compact(target.quotedText || target.preview, 360)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  if (!raw) return `Replying to ${target.label}:\n${quote}`;
  return `Replying to ${target.label}:\n${quote}\n\n${raw}`;
}

export function downloadableUrlForLine(line: TranscriptLine): string | undefined {
  return line.fileUrl || line.audioUrl || line.imageUrl || line.videoUrl;
}

export function isInspectableLine(line: TranscriptLine): boolean {
  return Boolean(
    line.noticeKind === "tool" ||
      line.noticeKind === "reasoning" ||
      line.toolName ||
      line.toolArgs ||
      line.toolResult ||
      line.toolError,
  );
}

export function lineInspectText(line: TranscriptLine): string {
  const entries = [
    ["id", line.id],
    ["kind", line.kind],
    ["role", transcriptLineRole(line)],
    ["notice", line.noticeKind],
    ["tool", line.toolName],
    ["status", line.toolStatus],
    ["duration", line.toolDurationMs != null ? `${line.toolDurationMs} ms` : undefined],
    ["args", line.toolArgs],
    ["result", line.toolResult],
    ["error", line.toolError],
    ["text", line.text],
  ];
  return entries
    .filter(([, value]) => value != null && String(value).length > 0)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}

export function canRetryLine(line: TranscriptLine): boolean {
  if (line.streaming) return false;
  return ["user", "command", "assistant", "audio-out", "error"].includes(line.kind);
}
