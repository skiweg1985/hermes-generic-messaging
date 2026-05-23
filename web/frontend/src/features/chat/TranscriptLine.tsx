import { AudioPlayer } from "./AudioPlayer";
import { BlockCursor } from "./BlockCursor";
import type { TranscriptLine as Line } from "../../types/events";

interface TranscriptLineProps {
  line: Line;
}

function prefix(kind: Line["kind"]): string {
  switch (kind) {
    case "user":
      return "> ";
    case "command":
      return "> ";
    case "assistant":
      return "assistant> ";
    case "upload":
      return "";
    case "error":
      return "";
    case "audio-out":
      return "";
    default:
      return "";
  }
}

function className(kind: Line["kind"]): string {
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
    default:
      return "";
  }
}

export function TranscriptLine({ line }: TranscriptLineProps) {
  if (line.kind === "audio-out") {
    return (
      <div className={className(line.kind)}>
        <div>{line.text}</div>
        <AudioPlayer url={line.audioUrl ?? ""} mimeType={line.mimeType} />
      </div>
    );
  }

  const pre = prefix(line.kind);
  const display =
    line.kind === "command" ? line.text : line.kind === "upload" ? line.text : `${pre}${line.text}`;

  return (
    <div className={className(line.kind)}>
      {display}
      {line.streaming ? <BlockCursor /> : null}
    </div>
  );
}
