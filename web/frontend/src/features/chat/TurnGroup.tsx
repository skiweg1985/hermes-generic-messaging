import type { AssistantButton, TranscriptLine } from "../../types/events";
import type { ChatMessage, MessageTurn } from "./model/messageTypes";
import { PartRenderer } from "./PartRenderer";
import type { MessageActionTarget } from "./messageActions";

interface TurnGroupProps {
  turn: MessageTurn;
  turnActive: boolean;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
  onMessageAction: (target: MessageActionTarget) => void;
}

export function TurnGroup({
  turn,
  turnActive,
  onButtonClick,
  onMessageAction,
}: TurnGroupProps) {
  const outputs = turn.outputs.filter(
    (message, index, all) =>
      !(isAudioLabelMessage(message) && hasAudioPart(all[index + 1])),
  );
  const showSpine = outputs.length > 1;

  return (
    <div className="turn">
      {turn.user ? (
        <div className="turn-user">
          <PartRenderer
            message={turn.user}
            alignRight
            turnActive={turnActive}
            onButtonClick={onButtonClick}
            onMessageAction={onMessageAction}
          />
        </div>
      ) : null}

      {outputs.length > 0 ? (
        <div
          className={`turn-outputs${showSpine ? " turn-outputs-with-spine" : ""}`}
        >
          {showSpine ? <span className="turn-spine" aria-hidden /> : null}
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
