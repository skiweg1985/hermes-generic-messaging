import type { AssistantButton, TranscriptLine } from "../../../types/events";
import { MarkdownText } from "../MarkdownText";
import { IconCheck } from "../../shell/icons";

interface ApprovalCardProps {
  line: TranscriptLine;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
}

export function ApprovalCard({ line, onButtonClick }: ApprovalCardProps) {
  const isPick =
    line.buttonKind === "slash_pick" || line.buttonKind === "model_picker";
  const isConfirm = line.buttonKind === "slash_confirm";
  const lockButtons =
    line.buttonKind === "slash_confirm" ||
    line.buttonKind === "slash_pick" ||
    (line.buttons?.length ?? 0) === 0;

  const variant = isPick ? "pick" : isConfirm ? "confirm" : "default";

  return (
    <section
      className={`approval approval-${variant}`}
      aria-label={line.title ?? (isPick ? "Options" : "Confirmation")}
    >
      {line.title ? (
        <div className="approval-title t-title">{line.title}</div>
      ) : null}
      {line.text ? (
        <div className="prose approval-body">
          <MarkdownText text={line.text} />
        </div>
      ) : null}
      {(line.buttons?.length ?? 0) > 0 ? (
        <div className={`approval-buttons${isPick ? " approval-buttons-grid" : ""}`}>
          {(line.buttons ?? []).map((button) => {
            const inactive = button.id === "mx:noop";
            const selected = line.clickedButtonId === button.id;
            return (
              <button
                key={button.id}
                type="button"
                className={`approval-btn approval-btn-${button.style}${selected ? " approval-btn-selected" : ""}`}
                disabled={inactive || (lockButtons && Boolean(line.clickedButtonId))}
                onClick={() => onButtonClick(line, button)}
              >
                {selected ? (
                  <IconCheck size={12} aria-hidden />
                ) : null}
                <span>{button.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
