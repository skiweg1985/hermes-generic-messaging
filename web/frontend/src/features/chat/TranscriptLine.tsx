import { AudioPlayer } from "./AudioPlayer";
import { BlockCursor } from "./BlockCursor";
import { MarkdownText } from "./MarkdownText";
import type { AssistantButton, TranscriptLine as Line } from "../../types/events";

interface TranscriptLineProps {
  line: Line;
  onButtonClick: (line: Line, button: AssistantButton) => void;
}

function prefix(kind: Line["kind"]): string {
  switch (kind) {
    case "user":
    case "command":
      return "> ";
    case "assistant":
      return "assistant> ";
    default:
      return "";
  }
}

function className(kind: Line["kind"], extra = ""): string {
  const base = (() => {
    switch (kind) {
      case "user":
      case "command":
        return "line-user";
      case "assistant":
        return "line-assistant";
      case "upload":
        return "line-upload";
      case "error":
        return "line-error";
      case "audio-out":
        return "line-assistant";
      case "buttons":
        return "line-buttons";
      case "notice":
        return "line-notice";
      case "image":
        return "line-image";
      case "file":
        return "line-upload";
      default:
        return "";
    }
  })();
  return `${base}${extra ? ` ${extra}` : ""}`;
}

export function TranscriptLine({ line, onButtonClick }: TranscriptLineProps) {
  if (line.kind === "audio-out") {
    return (
      <div className={className(line.kind)}>
        <div>{line.text}</div>
        <AudioPlayer url={line.audioUrl ?? ""} mimeType={line.mimeType} />
      </div>
    );
  }

  if (line.kind === "buttons") {
    const isPick = line.buttonKind === "slash_pick" || line.buttonKind === "model_picker";
    const isConfirm = line.buttonKind === "slash_confirm";
    const lockButtons =
      line.buttonKind === "slash_confirm" ||
      line.buttonKind === "slash_pick" ||
      (line.buttons?.length ?? 0) === 0;
    return (
      <section
        className={`${className(line.kind)}${isPick ? " line-buttons-pick" : ""}${isConfirm ? " line-buttons-confirm" : ""}`}
        aria-label={line.title ?? (isPick ? "Options" : "Confirmation")}
      >
        {line.title ? <div className="line-card-title">{line.title}</div> : null}
        {line.text ? <MarkdownText text={line.text} /> : null}
        {(line.buttons?.length ?? 0) > 0 ? (
          <div className={isPick ? "button-row button-row-grid" : "button-row"}>
            {(line.buttons ?? []).map((button) => {
              const inactive = button.id === "mx:noop";
              return (
                <button
                  key={button.id}
                  type="button"
                  className={`choice-button choice-${button.style}${line.clickedButtonId === button.id ? " choice-selected" : ""}`}
                  disabled={inactive || (lockButtons && Boolean(line.clickedButtonId))}
                  onClick={() => onButtonClick(line, button)}
                >
                  {line.clickedButtonId === button.id ? "✓ " : ""}
                  {button.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>
    );
  }

  if (line.kind === "notice") {
    const noticeClass = line.noticeKind ?? "info";
    return (
      <aside className={className(line.kind, `notice-${noticeClass}`)}>
        <span className="notice-label">{noticeClass}</span>
        <MarkdownText text={line.text} />
      </aside>
    );
  }

  if (line.kind === "image") {
    return (
      <figure className={className(line.kind)}>
        {line.imageUrl ? <img src={line.imageUrl} alt={line.caption ?? "assistant image"} /> : null}
        {line.caption ? (
          <figcaption>
            <MarkdownText text={line.caption} />
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (line.kind === "upload" || line.kind === "file") {
    return (
      <div className={className(line.kind)}>
        <div>{line.text}</div>
        {line.fileUrl ? (
          <a
            className="line-file-link"
            href={line.fileUrl}
            target="_blank"
            rel="noreferrer"
          >
            {line.fileName ?? "open file"}
          </a>
        ) : null}
      </div>
    );
  }

  const pre = prefix(line.kind);
  const text =
    line.kind === "command" || line.kind === "error"
      ? line.text
      : `${pre}${line.text}`;

  if (line.kind === "assistant") {
    const isReasoning = line.text.trimStart().startsWith("💭");
    return (
      <div
        className={className(
          line.kind,
          `${line.interrupted ? "line-interrupted" : ""}${isReasoning ? " line-reasoning" : ""}`,
        )}
      >
        {line.title ? <div className="line-segment-label">{line.title}</div> : null}
        <span className="line-prefix">{pre}</span>
        <MarkdownText text={line.text} />
        {line.interrupted ? <span className="line-meta"> interrupted</span> : null}
        {line.streaming ? <BlockCursor /> : null}
      </div>
    );
  }

  return <div className={className(line.kind)}>{text}</div>;
}
