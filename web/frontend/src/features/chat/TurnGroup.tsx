import type { AssistantButton, TranscriptLine } from "../../types/events";
import type { MessageTurn } from "./model/messageTypes";
import { PartRenderer } from "./PartRenderer";

interface TurnGroupProps {
  turn: MessageTurn;
  turnActive: boolean;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
}

export function TurnGroup({ turn, turnActive, onButtonClick }: TurnGroupProps) {
  const showSpine = turn.outputs.length > 1;

  return (
    <div className="turn">
      {turn.user ? (
        <div className="turn-user">
          <PartRenderer
            message={turn.user}
            alignRight
            turnActive={turnActive}
            onButtonClick={onButtonClick}
          />
        </div>
      ) : null}

      {turn.outputs.length > 0 ? (
        <div
          className={`turn-outputs${showSpine ? " turn-outputs-with-spine" : ""}`}
        >
          {showSpine ? <span className="turn-spine" aria-hidden /> : null}
          <div className="turn-outputs-list">
            {turn.outputs.map((message) => (
              <div key={message.messageId} className="turn-output motion-rise-in-soft">
                <PartRenderer
                  message={message}
                  turnActive={turnActive}
                  onButtonClick={onButtonClick}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
