import type { TranscriptLine, ToolStatus } from "../../../types/events";
import { parseActivity } from "../../activity/toolRegistry";
import { splitReasoning } from "../reasoningSplit";
import type { MessagePart } from "./messageTypes";

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

function shouldShowToolActivity(status: ToolStatus): boolean {
  return status === "running" || status === "error";
}

function isToolLikeNotice(kind: string, line: TranscriptLine): boolean {
  if (kind === "tool" || line.toolName || line.toolStatus) return true;
  const text = line.text.toLowerCase();
  return /\b(running|starting|loading|fetching|browsing|searching|calling)\b/.test(text);
}

function isUserLine(line: TranscriptLine): boolean {
  if (line.role === "user") return true;
  if (line.kind === "user" || line.kind === "command" || line.kind === "upload") return true;
  if (line.kind === "image" || line.kind === "audio-out" || line.kind === "video") {
    return line.text.startsWith("user>") || line.text.startsWith("[upload]");
  }
  return false;
}

export function lineToParts(line: TranscriptLine, turnActive: boolean): MessagePart[] {
  switch (line.kind) {
    case "user":
      return [{ type: "text", text: line.text }];
    case "command":
      return [{ type: "text", text: line.text, command: true }];
    case "assistant": {
      const parts: MessagePart[] = [];
      const split = line.reasoningText?.trim()
        ? { reasoning: line.reasoningText.trim(), answer: line.text }
        : splitReasoning(line.text);
      const reasoningText = split.reasoning.trim();
      const answerText = split.answer;
      if (reasoningText) {
        parts.push({
          type: "reasoning",
          text: reasoningText,
          active: Boolean(line.streaming),
        });
      }
      if (answerText || line.streaming) {
        parts.push({
          type: "text",
          text: answerText,
          streaming: line.streaming,
        });
      }
      return parts.length > 0 ? parts : [{ type: "text", text: line.text, streaming: line.streaming }];
    }
    case "notice": {
      const kind = (line.noticeKind ?? "info").toLowerCase();
      if (isToolLikeNotice(kind, line)) {
        const structuredStatus =
          parseToolStatus(line.toolStatus) ??
          (line.toolError ? "error" : line.toolResult ? "success" : undefined);
        if (line.toolName || structuredStatus) {
          const parsed = parseActivity(line.text);
          const status = structuredStatus ?? parsed.state;
          if (!shouldShowToolActivity(status)) return [];
          return [
            {
              type: "tool_call",
              toolName: line.toolName ?? parsed.rawName,
              status,
              summary: parsed.summary,
              args: line.toolArgs,
              result: line.toolResult,
              durationMs: line.toolDurationMs,
              error: line.toolError,
              detail: parsed.detail || line.toolArgs,
              rawText: line.text,
              lineId: line.id,
            },
          ];
        }
        const parsed = parseActivity(line.text);
        if (!shouldShowToolActivity(parsed.state)) return [];
        return [
          {
            type: "tool_call",
            toolName: parsed.rawName,
            status: parsed.state,
            summary: parsed.summary,
            detail: parsed.detail,
            rawText: line.text,
            lineId: line.id,
          },
        ];
      }
      if (kind === "reasoning") {
        return [
          {
            type: "reasoning",
            text: line.text,
            active: turnActive,
          },
        ];
      }
      return [{ type: "notice", text: line.text, noticeKind: kind, lineId: line.id }];
    }
    case "image":
      return [
        {
          type: "image",
          url: line.imageUrl ?? "",
          caption: line.caption ?? line.text,
          mimeType: line.mimeType,
          downloadUrl: line.fileUrl ?? line.imageUrl,
          fileName: line.fileName,
          lineId: line.id,
        },
      ];
    case "video":
      return [
        {
          type: "video",
          url: line.videoUrl ?? line.fileUrl ?? "",
          fileName: line.fileName,
          mimeType: line.mimeType,
          posterUrl: line.posterUrl,
          lineId: line.id,
        },
      ];
    case "file":
    case "upload":
      return [
        {
          type: "file",
          url: line.fileUrl ?? "",
          fileName: line.fileName ?? "file",
          mimeType: line.mimeType,
          sizeBytes: line.sizeBytes,
          lineId: line.id,
        },
      ];
    case "audio-out":
      return [
        {
          type: "audio",
          url: line.audioUrl ?? "",
          fileName: line.fileName,
          mimeType: line.mimeType,
          downloadUrl: line.fileUrl ?? line.audioUrl,
          lineId: line.id,
        },
      ];
    case "buttons":
      return [
        {
          type: "buttons",
          title: line.title,
          body: line.text,
          buttons: line.buttons ?? [],
          confirmId: line.confirmId,
          pickId: line.pickId,
          commandBase: line.commandBase,
          buttonKind: line.buttonKind,
          clickedButtonId: line.clickedButtonId,
          lineId: line.id,
        },
      ];
    case "error": {
      const match = /^error:\s*([^-]+)\s*-\s*(.+)$/i.exec(line.text);
      return [
        {
          type: "error",
          code: match?.[1]?.trim() ?? "ERROR",
          message: match?.[2]?.trim() ?? line.text,
          lineId: line.id,
        },
      ];
    }
    default:
      return [];
  }
}

export function lineMessageStatus(line: TranscriptLine): import("./messageTypes").MessageStatus {
  if (line.kind === "error") return "error";
  if (line.interrupted) return "interrupted";
  if (line.streaming) return "streaming";
  return "done";
}

export function lineMessageRole(line: TranscriptLine): import("./messageTypes").MessageRole {
  if (isUserLine(line)) return "user";
  if (line.kind === "error") return "system";
  return "assistant";
}
