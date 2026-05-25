import type { TranscriptLine } from "../../types/events";
import { IconDownload } from "../shell/icons";

interface VideoCardProps {
  line: TranscriptLine;
  alignRight?: boolean;
}

export function VideoCard({ line, alignRight }: VideoCardProps) {
  const url = line.videoUrl ?? line.fileUrl;
  if (!url) return null;

  const name = line.fileName ?? "video";

  return (
    <figure
      className={`media-video-card${alignRight ? " media-video-card-right" : ""} motion-rise-in-soft`}
    >
      <div className="media-video-wrap">
        <video
          className="media-video-player"
          src={url}
          controls
          preload="metadata"
          poster={line.posterUrl}
          aria-label={name}
        />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="media-video-download"
          aria-label={`Download ${name}`}
          title="Download"
        >
          <IconDownload size={14} />
        </a>
      </div>
      {line.fileName ? (
        <figcaption className="media-video-caption t-meta truncate" title={line.fileName}>
          {line.fileName}
        </figcaption>
      ) : null}
    </figure>
  );
}
