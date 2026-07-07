import type { AssistantButton, TranscriptLine } from "../../types/events";
import type { ChatMessage, MessageTurn } from "./model/messageTypes";
import { PartRenderer } from "./PartRenderer";
import type { MessageActionTarget } from "./messageActions";

interface TurnGroupProps {
  turn: MessageTurn;
  turnActive: boolean;
  /** Frisch gesendet (kein Historien-Turn) — löst die Send-Animation aus. */
  freshUser?: boolean;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
  onMessageAction: (target: MessageActionTarget) => void;
  onReplyLine: (line: TranscriptLine) => void;
}

export function TurnGroup({
  turn,
  turnActive,
  freshUser = false,
  onButtonClick,
  onMessageAction,
  onReplyLine,
}: TurnGroupProps) {
  const outputs = turn.outputs.filter(
    (message, index, all) =>
      message.parts.length > 0 &&
      !(isAudioLabelMessage(message) && hasAudioPart(all[index + 1])),
  );

  return (
    <div className="turn">
      {turn.user ? (
        <div className={`turn-user${freshUser ? " turn-user-fresh" : ""}`}>
          <PartRenderer
            message={turn.user}
            alignRight
            fresh={freshUser}
            turnActive={turnActive}
            onButtonClick={onButtonClick}
            onMessageAction={onMessageAction}
            onReplyLine={onReplyLine}
          />
        </div>
      ) : null}

      {outputs.length > 0 ? (
        <div className="turn-outputs">
          <div className="turn-outputs-list">
            {outputs.map((message) => (
              <div
                key={message.messageId}
                className={`turn-output motion-rise-in-soft${
                  isActivityMessage(message) ? " turn-output-activity" : ""
                }`}
              >
                <PartRenderer
                  message={message}
                  turnActive={turnActive}
                  onButtonClick={onButtonClick}
                  onMessageAction={onMessageAction}
                  onReplyLine={onReplyLine}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function hasAudioPart(message?: ChatMessage): boolean {
  return Boolean(message?.parts.some((part) => part.type === "audio"));
}

function isActivityMessage(message: ChatMessage): boolean {
  return message.parts.every(
    (part) =>
      part.type === "tool_call" ||
      (part.type === "notice" && part.noticeKind !== "error") ||
      part.type === "reasoning",
  );
}

function isAudioLabelMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant" || message.parts.length !== 1) return false;
  const part = message.parts[0];
  if (!part || part.type !== "text") return false;
  const normalized = part.text
    .trim()
    .replace(/^[^A-Za-zÄÖÜäöü0-9]+/, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();
  return normalized === "audio" || normalized === "voice" || normalized === "sprachi";
}
