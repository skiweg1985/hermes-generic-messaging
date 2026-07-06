import type { TranscriptLine } from "../../../types/events";
import { MarkdownText } from "../MarkdownText";
import { useStreamingText } from "../../../hooks/useStreamingText";

interface MessageAssistantProps {
  line: TranscriptLine;
}

/**
 * Plain assistant prose. Streaming caret appears at the end when active.
 * Reasoning (Phase 4) and Activity (Phase 3) are siblings, not nested here.
 */
export function MessageAssistant({ line }: MessageAssistantProps) {
  const interrupted = Boolean(line.interrupted);
  const streaming = Boolean(line.streaming);
  const text = useStreamingText(line.text, streaming);
  return (
    <article
      className={`msg-assistant${interrupted ? " msg-assistant-interrupted" : ""}`}
      aria-busy={streaming || undefined}
    >
      {line.title ? (
        <div className="msg-assistant-label t-label">{line.title}</div>
      ) : null}
      <div className="msg-assistant-bubble">
        <div className={`prose${streaming ? " prose-streaming" : ""}`}>
          <MarkdownText text={text} />
          {streaming ? <Caret /> : null}
        </div>
      </div>
      {interrupted ? (
        <div className="t-meta msg-assistant-meta">Interrupted</div>
      ) : null}
    </article>
  );
}

function Caret() {
  return <span className="streaming-caret" aria-hidden />;
}
