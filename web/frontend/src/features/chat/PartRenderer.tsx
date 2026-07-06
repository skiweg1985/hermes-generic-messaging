import { Fragment, type ReactNode } from "react";
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
import { MessageActionSurface } from "./MessageActionSurface";
import type { MessageActionTarget } from "./messageActions";

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
        text: part.rawText ?? (part.summary ? `${part.toolName}: ${part.summary}` : part.toolName),
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
  onMessageAction: (target: MessageActionTarget) => void;
  onReplyLine: (line: TranscriptLine) => void;
}

export function PartRenderer({
  message,
  alignRight = false,
  turnActive,
  onButtonClick,
  onMessageAction,
  onReplyLine,
}: PartRendererProps) {
  const withActions = (line: TranscriptLine, node: ReactNode, actionAlignRight = false) => (
    <MessageActionSurface
      line={line}
      alignRight={actionAlignRight}
      onOpen={onMessageAction}
      onReply={onReplyLine}
    >
      {node}
    </MessageActionSurface>
  );

  const replyLabel = message.metadata.replyToLabel;
  const replyPreview = message.metadata.replyToPreview;
  const showReplyContext = message.role === "user" && Boolean(replyLabel || replyPreview);

  return (
    <div className="message-part-stack">
      {showReplyContext ? (
        <div className="turn-user-row">
          <div className="msg-reply-context" aria-label={`In reply to ${replyLabel ?? "message"}`}>
            {replyLabel ? <span className="msg-reply-context-label">{replyLabel}</span> : null}
            {replyPreview ? (
              <span className="msg-reply-context-preview">{replyPreview}</span>
            ) : null}
          </div>
        </div>
      ) : null}
      {message.parts.map((part, index) => {
        const line = partToLine(part, message);
        const key = `${message.messageId}-${part.type}-${index}`;
        const partAlignRight = alignRight || line.role === "user";

        switch (part.type) {
          case "text":
            if (part.command || message.role === "user") {
              const userLine = {
                ...line,
                kind: part.command ? "command" : "user",
                text: part.text,
              } as TranscriptLine;
              return (
                <div key={key} className={partAlignRight ? "turn-user-row" : undefined}>
                  {withActions(userLine, <MessageUser line={userLine} />, partAlignRight)}
                </div>
              );
            }
            return <div key={key}>{withActions(line, <MessageAssistant line={line} />)}</div>;
          case "reasoning":
            return (
              <div key={key}>
                {withActions(
                  line,
                  <MessageReasoning
                    text={part.text}
                    active={part.active ?? turnActive}
                    line={line}
                  />,
                )}
              </div>
            );
          case "tool_call":
            return (
              <div key={key}>
                {withActions(line, <ActivityCard line={line} />)}
              </div>
            );
          case "image":
            return (
              <div key={key} className={partAlignRight ? "turn-user-row" : undefined}>
                {withActions(line, <ImageCard line={line} alignRight={partAlignRight} />, partAlignRight)}
              </div>
            );
          case "video":
            return (
              <div key={key} className={partAlignRight ? "turn-user-row" : undefined}>
                {withActions(line, <VideoCard line={line} alignRight={partAlignRight} />, partAlignRight)}
              </div>
            );
          case "file":
            return (
              <div key={key} className={partAlignRight ? "turn-user-row" : undefined}>
                {withActions(line, <FileCard line={line} alignRight={partAlignRight} />, partAlignRight)}
              </div>
            );
          case "audio":
            return (
              <Fragment key={key}>
                {part.caption && message.role === "assistant" ? (
                  withActions(
                    { ...line, kind: "assistant", text: part.caption },
                    <MessageAssistant line={{ ...line, kind: "assistant", text: part.caption }} />,
                  )
                ) : null}
                <div className={partAlignRight ? "turn-user-row" : undefined}>
                  {withActions(line, <AudioCard line={line} alignRight={partAlignRight} />, partAlignRight)}
                </div>
              </Fragment>
            );
          case "error":
            return <div key={key}>{withActions(line, <ErrorCard line={line} />)}</div>;
          case "buttons":
            return (
              <div key={key}>
                {withActions(
                  line,
                  <ApprovalCard line={line} onButtonClick={onButtonClick} />,
                )}
              </div>
            );
          case "notice":
            return <div key={key}>{withActions(line, <NoticeCard line={line} />)}</div>;
          default:
            return null;
        }
      })}
    </div>
  );
}
