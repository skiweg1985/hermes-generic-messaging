import type { TranscriptLine } from "../../../types/events";
import { MarkdownText } from "../MarkdownText";

interface MessageUserProps {
  line: TranscriptLine;
  /** Zeigt den animierten "Gesendet"-Haken (nur für frisch gesendete Turns). */
  receipt?: boolean;
}

export function MessageUser({ line, receipt = false }: MessageUserProps) {
  const isCommand = line.kind === "command";
  return (
    <div className="msg-user motion-rise-in-soft">
      <div className="msg-user-stack">
        <div className={`msg-user-bubble${isCommand ? " msg-user-bubble-command" : ""}`}>
          {isCommand ? (
            <span className="msg-user-cmd">{line.text}</span>
          ) : (
            <MarkdownText text={line.text} />
          )}
        </div>
        {receipt ? (
          <span className="msg-user-receipt" aria-hidden>
            <svg viewBox="0 0 12 12" width="11" height="11">
              <path
                className="msg-receipt-check"
                d="M2 6.4l2.7 2.7L10 3.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Sent</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
