import type { TranscriptLine } from "../../types/events";
import { resolveMediaUrl } from "../../lib/resolveMediaUrl";
import { WaveformPlayer } from "./WaveformPlayer";

interface AudioCardProps {
  line: TranscriptLine;
  alignRight?: boolean;
}

export function AudioCard({ line, alignRight }: AudioCardProps) {
  if (!line.audioUrl) return null;
  return (
    <div className={`audio-card${alignRight ? " audio-card-right" : ""} motion-rise-in-soft`}>
      <WaveformPlayer
        url={resolveMediaUrl(line.audioUrl)}
        fileName={line.fileName ?? "audio"}
        downloadUrl={resolveMediaUrl(line.fileUrl ?? line.audioUrl)}
        mimeType={line.mimeType}
      />
    </div>
  );
}
