import type { TranscriptLine } from "../../types/events";
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
        url={line.audioUrl}
        fileName={line.fileName ?? "audio"}
        downloadUrl={line.fileUrl ?? line.audioUrl}
        mimeType={line.mimeType}
      />
    </div>
  );
}
