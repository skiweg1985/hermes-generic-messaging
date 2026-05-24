import { Fragment } from "react";
import type { AssistantButton, TranscriptLine } from "../../types/events";
import type { Turn } from "./turnGrouping";
import { isUserMediaLine } from "./turnGrouping";
import { MessageUser } from "./messages/MessageUser";
import { MessageAssistant } from "./messages/MessageAssistant";
import { MessageReasoning } from "./messages/MessageReasoning";
import { NoticeCard } from "./messages/NoticeCard";
import { ErrorCard } from "./messages/ErrorCard";
import { ApprovalCard } from "./messages/ApprovalCard";
import { ImageCard } from "../media/ImageCard";
import { FileCard } from "../media/FileCard";
import { AudioCard } from "../media/AudioCard";
import { ActivityCard } from "../activity/ActivityCard";
import { splitReasoning } from "./reasoningSplit";

interface TurnGroupProps {
  turn: Turn;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
}

function renderUserLine(line: TranscriptLine): JSX.Element {
  if (line.kind === "upload") {
    return (
      <div className="turn-user-row">
        <FileCard line={line} alignRight />
      </div>
    );
  }
  if (line.kind === "image" && isUserMediaLine(line)) {
    return (
      <div className="turn-user-row">
        <ImageCard line={line} alignRight />
      </div>
    );
  }
  if (line.kind === "audio-out" && isUserMediaLine(line)) {
    return (
      <div className="turn-user-row">
        <AudioCard line={line} alignRight />
      </div>
    );
  }
  return <MessageUser line={line} />;
}

function renderOutput(
  line: TranscriptLine,
  turn: Turn,
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void,
): JSX.Element | null {
  switch (line.kind) {
    case "assistant":
    case "audio-out": {
      if (line.kind === "assistant") {
        const reasoningText =
          line.reasoningText?.trim() ||
          splitReasoning(line.text).reasoning;
        const answerText = line.reasoningText
          ? line.text
          : splitReasoning(line.text).answer;
        if (reasoningText) {
          return (
            <Fragment>
              <MessageReasoning
                text={reasoningText}
                active={Boolean(line.streaming)}
                line={line}
              />
              {answerText ? (
                <MessageAssistant
                  line={{ ...line, text: answerText }}
                />
              ) : null}
            </Fragment>
          );
        }
      }
      if (line.kind === "audio-out") {
        if (isUserMediaLine(line)) return null;
        return (
          <Fragment>
            {line.text ? (
              <MessageAssistant
                line={{ ...line, kind: "assistant", streaming: false }}
              />
            ) : null}
            <AudioCard line={line} />
          </Fragment>
        );
      }
      return <MessageAssistant line={line} />;
    }
    case "notice": {
      const kind = (line.noticeKind ?? "info").toLowerCase();
      if (kind === "tool") {
        const turnActive = turn.outputs.some((o) => o.streaming === true);
        return <ActivityCard line={line} turnActive={turnActive} />;
      }
      if (kind === "reasoning") {
        return (
          <MessageReasoning
            text={line.text}
            active={turn.outputs.some((o) => o.streaming === true)}
            line={line}
          />
        );
      }
      return <NoticeCard line={line} />;
    }
    case "buttons":
      return <ApprovalCard line={line} onButtonClick={onButtonClick} />;
    case "image":
      if (isUserMediaLine(line)) return null;
      return <ImageCard line={line} />;
    case "file":
      return <FileCard line={line} />;
    case "error":
      return <ErrorCard line={line} />;
    case "empty":
      return null;
    default:
      return null;
  }
}

export function TurnGroup({
  turn,
  onButtonClick,
}: TurnGroupProps) {
  const userLine = turn.user;
  const showSpine = turn.outputs.length > 1;

  return (
    <div className="turn">
      {userLine ? renderUserLine(userLine) : null}

      {turn.outputs.length > 0 ? (
        <div
          className={`turn-outputs${showSpine ? " turn-outputs-with-spine" : ""}`}
        >
          {showSpine ? <span className="turn-spine" aria-hidden /> : null}
          <div className="turn-outputs-list">
            {turn.outputs.map((line) => (
              <div key={line.id} className="turn-output motion-rise-in-soft">
                {renderOutput(line, turn, onButtonClick)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

