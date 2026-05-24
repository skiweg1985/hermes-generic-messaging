import type { TranscriptLine } from "../../../types/events";
import { MarkdownText } from "../MarkdownText";

interface MessageUserProps {
  line: TranscriptLine;
}

export function MessageUser({ line }: MessageUserProps) {
  const isCommand = line.kind === "command";
  return (
    <div className="msg-user motion-rise-in-soft">
      <div className={`msg-user-bubble${isCommand ? " msg-user-bubble-command" : ""}`}>
        {isCommand ? (
          <span className="msg-user-cmd">{line.text}</span>
        ) : (
          <MarkdownText text={line.text} />
        )}
      </div>
    </div>
  );
}
