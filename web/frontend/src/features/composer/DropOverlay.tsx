import { IconPaperclip } from "../shell/icons";

export function DropOverlay() {
  return (
    <div className="drop-overlay" role="status" aria-live="polite">
      <div className="drop-overlay-card motion-scale-in">
        <span className="drop-overlay-icon" aria-hidden>
          <IconPaperclip size={20} />
        </span>
        <div className="drop-overlay-title t-title">Drop to attach</div>
        <div className="drop-overlay-hint t-meta">
          Files, images and audio supported
        </div>
      </div>
    </div>
  );
}
