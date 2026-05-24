import { Fragment } from "react";
import type { AssistantButton, TranscriptLine } from "../../types/events";
import type { Turn } from "./turnGrouping";
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

interface TurnGroupProps {
  turn: Turn;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
  isLast: boolean;
  showTyping: boolean;
}

function splitReasoning(text: string): { reasoning: string; answer: string } {
  // Heuristic: if the text begins with 💭 and contains a blank line,
  // split into reasoning + answer; otherwise treat all as reasoning.
  if (!text.trimStart().startsWith("💭")) return { reasoning: "", answer: text };
  const stripped = text.replace(/^\s*💭\s*(reasoning:?\s*)?/i, "");
  const idx = stripped.search(/\n\s*\n/);
  if (idx < 0) return { reasoning: stripped, answer: "" };
  return {
    reasoning: stripped.slice(0, idx).trim(),
    answer: stripped.slice(idx).trim(),
  };
}

function renderOutput(
  line: TranscriptLine,
  turn: Turn,
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void,
): JSX.Element | null {
  switch (line.kind) {
    case "assistant":
    case "audio-out": {
      // Reasoning embedded in assistant text → split.
      if (line.kind === "assistant") {
        const { reasoning, answer } = splitReasoning(line.text);
        if (reasoning) {
          return (
            <Fragment>
              <MessageReasoning
                text={reasoning}
                active={Boolean(line.streaming)}
                line={line}
              />
              {answer ? (
                <MessageAssistant
                  line={{ ...line, text: answer }}
                />
              ) : null}
            </Fragment>
          );
        }
      }
      if (line.kind === "audio-out") {
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
  isLast,
  showTyping,
}: TurnGroupProps) {
  const userLine = turn.user;
  const showSpine = turn.outputs.length > 1;

  return (
    <div className="turn">
      {userLine ? (
        userLine.kind === "upload" ? (
          <div className="turn-user-row">
            <FileCard line={userLine} alignRight />
          </div>
        ) : (
          <MessageUser line={userLine} />
        )
      ) : null}

      {turn.outputs.length > 0 || (isLast && showTyping) ? (
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
            {isLast && showTyping ? (
              <div className="turn-output">
                <ActivityTyping />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActivityTyping() {
  return (
    <div className="typing-indicator" role="status" aria-label="Assistant is typing">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}
