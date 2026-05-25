import type { TranscriptLine } from "../../../types/events";
import { IconAlert } from "../../shell/icons";

interface ErrorCardProps {
  line: TranscriptLine;
}

export function ErrorCard({ line }: ErrorCardProps) {
  // The reducer puts errors in the form "error: CODE - message".
  const text = line.text.replace(/^error:\s*/i, "");
  const [code, rest] = text.split(/\s+-\s+/, 2);
  return (
    <div className="error-card" role="alert">
      <span className="error-card-icon" aria-hidden>
        <IconAlert size={14} />
      </span>
      <div className="error-card-body">
        <div className="t-label error-card-code">{code || "ERROR"}</div>
        {rest ? (
          <div className="t-body-sm error-card-message">{rest}</div>
        ) : null}
      </div>
    </div>
  );
}
