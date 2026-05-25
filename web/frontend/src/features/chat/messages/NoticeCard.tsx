import type { TranscriptLine } from "../../../types/events";
import { MarkdownText } from "../MarkdownText";
import { IconAlert } from "../../shell/icons";

interface NoticeCardProps {
  line: TranscriptLine;
}

export function NoticeCard({ line }: NoticeCardProps) {
  const kind = (line.noticeKind ?? "info").toLowerCase();
  return (
    <aside className={`notice notice-${kind}`} role="status">
      <span className="notice-icon" aria-hidden>
        <IconAlert size={14} />
      </span>
      <div className="notice-body">
        <div className="t-label notice-label">{kind}</div>
        <div className="prose notice-text">
          <MarkdownText text={line.text} />
        </div>
      </div>
    </aside>
  );
}
