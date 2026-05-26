import { Fragment } from "react";
import type { AssistantButton, TranscriptLine } from "../../types/events";
import type { ChatMessage, MessagePart } from "./model/messageTypes";
import { MessageUser } from "./messages/MessageUser";
import { MessageAssistant } from "./messages/MessageAssistant";
import { MessageReasoning } from "./messages/MessageReasoning";
import { NoticeCard } from "./messages/NoticeCard";
import { ErrorCard } from "./messages/ErrorCard";
import { ApprovalCard } from "./messages/ApprovalCard";
import { ImageCard } from "../media/ImageCard";
import { FileCard } from "../media/FileCard";
import { AudioCard } from "../media/AudioCard";
import { VideoCard } from "../media/VideoCard";
import { ActivityCard } from "../activity/ActivityCard";

function partToLine(part: MessagePart, message: ChatMessage): TranscriptLine {
  const base = {
    id: "lineId" in part ? part.lineId : message.metadata.lineIds[0] ?? message.messageId,
    text: "",
    threadId: message.metadata.threadId,
    sessionId: message.metadata.sessionId,
    turnMessageId: message.metadata.turnMessageId,
    streaming: message.status === "streaming",
    interrupted: message.metadata.interrupted,
  };

  switch (part.type) {
    case "text":
      return {
        ...base,
        kind: part.command ? "command" : "assistant",
        text: part.text,
        streaming: part.streaming,
      };
    case "reasoning":
      return { ...base, kind: "notice", noticeKind: "reasoning", text: part.text };
    case "tool_call":
      return {
        ...base,
        kind: "notice",
        noticeKind: "tool",
        text: part.summary ? `${part.toolName}: ${part.summary}` : part.toolName,
        toolName: part.toolName,
        toolStatus: part.status,
        toolArgs: part.args,
        toolResult: part.result,
        toolDurationMs: part.durationMs,
        toolError: part.error,
      };
    case "image":
      return {
        ...base,
        kind: "image",
        role: message.role === "user" ? "user" : "assistant",
        text: part.caption ?? "",
        imageUrl: part.url,
        caption: part.caption,
        fileUrl: part.downloadUrl,
        fileName: part.fileName,
        mimeType: part.mimeType,
      };
    case "video":
      return {
        ...base,
        kind: "video",
        role: message.role === "user" ? "user" : "assistant",
        text: part.fileName ?? "",
        videoUrl: part.url,
        fileUrl: part.url,
        fileName: part.fileName,
        mimeType: part.mimeType,
        posterUrl: part.posterUrl,
      };
    case "file":
      return {
        ...base,
        kind: message.role === "user" ? "upload" : "file",
        role: message.role === "user" ? "user" : "assistant",
        text: part.fileName,
        fileUrl: part.url,
        fileName: part.fileName,
        mimeType: part.mimeType,
        sizeBytes: part.sizeBytes,
      };
    case "audio":
      return {
        ...base,
        kind: "audio-out",
        role: message.role === "user" ? "user" : "assistant",
        text: part.caption ?? "",
        audioUrl: part.url,
        fileUrl: part.downloadUrl,
        fileName: part.fileName,
        mimeType: part.mimeType,
      };
    case "error":
      return {
        ...base,
        kind: "error",
        text: `error: ${part.code} - ${part.message}`,
      };
    case "buttons":
      return {
        ...base,
        kind: "buttons",
        title: part.title,
        text: part.body,
        buttons: part.buttons,
        confirmId: part.confirmId,
        pickId: part.pickId,
        commandBase: part.commandBase,
        buttonKind: part.buttonKind,
        clickedButtonId: part.clickedButtonId,
      };
    case "notice":
      return {
        ...base,
        kind: "notice",
        noticeKind: part.noticeKind,
        text: part.text,
      };
    default:
      return { ...base, kind: "assistant", text: "" };
  }
}

interface PartRendererProps {
  message: ChatMessage;
  alignRight?: boolean;
  turnActive: boolean;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
}

export function PartRenderer({
  message,
  alignRight = false,
  turnActive,
  onButtonClick,
}: PartRendererProps) {
  return (
    <div className="message-part-stack">
      {message.parts.map((part, index) => {
        const line = partToLine(part, message);
        const key = `${message.messageId}-${part.type}-${index}`;

        switch (part.type) {
          case "text":
            if (part.command || message.role === "user") {
              return (
                <MessageUser
                  key={key}
                  line={{ ...line, kind: part.command ? "command" : "user", text: part.text }}
                />
              );
            }
            return <MessageAssistant key={key} line={line} />;
          case "reasoning":
            return (
              <MessageReasoning
                key={key}
                text={part.text}
                active={part.active ?? turnActive}
                line={line}
              />
            );
          case "tool_call":
            return <ActivityCard key={key} line={line} turnActive={turnActive} />;
          case "image":
            return (
              <div key={key} className={alignRight ? "turn-user-row" : undefined}>
                <ImageCard line={line} alignRight={alignRight} />
              </div>
            );
          case "video":
            return (
              <div key={key} className={alignRight ? "turn-user-row" : undefined}>
                <VideoCard line={line} alignRight={alignRight} />
              </div>
            );
          case "file":
            return (
              <div key={key} className={alignRight ? "turn-user-row" : undefined}>
                <FileCard line={line} alignRight={alignRight} />
              </div>
            );
          case "audio":
            return (
              <Fragment key={key}>
                {part.caption && message.role === "assistant" ? (
                  <MessageAssistant line={{ ...line, kind: "assistant", text: part.caption }} />
                ) : null}
                <div className={alignRight ? "turn-user-row" : undefined}>
                  <AudioCard line={line} alignRight={alignRight} />
                </div>
              </Fragment>
            );
          case "error":
            return <ErrorCard key={key} line={line} />;
          case "buttons":
            return <ApprovalCard key={key} line={line} onButtonClick={onButtonClick} />;
          case "notice":
            return <NoticeCard key={key} line={line} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
