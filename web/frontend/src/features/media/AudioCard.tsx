import type { TranscriptLine } from "../../types/events";
import { resolveMediaUrl } from "../../lib/resolveMediaUrl";
import { WaveformPlayer } from "./WaveformPlayer";

interface AudioCardProps {
  line: TranscriptLine;
  alignRight?: boolean;
}

export function AudioCard({ line, alignRight }: AudioCardProps) {
  if (!line.audioUrl) return null;
  const showFileActions = Boolean(line.fileName);
  const role = line.role ?? (alignRight ? "user" : "assistant");
  return (
    <div
      className={`audio-card audio-card-${role}${
        alignRight ? " audio-card-right" : ""
      } motion-rise-in-soft`}
    >
      <WaveformPlayer
        url={resolveMediaUrl(line.audioUrl)}
        fileName={line.fileName}
        downloadUrl={showFileActions ? resolveMediaUrl(line.fileUrl ?? line.audioUrl) : undefined}
        mimeType={line.mimeType}
      />
    </div>
  );
}
