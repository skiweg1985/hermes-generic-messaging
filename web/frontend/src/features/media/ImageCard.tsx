import { useEffect } from "react";
import type { TranscriptLine } from "../../types/events";
import { downloadMedia } from "../../lib/downloadMedia";
import { resolveMediaUrl } from "../../lib/resolveMediaUrl";
import { IconDownload } from "../shell/icons";
import { useMediaContext } from "./MediaProvider";

interface ImageCardProps {
  line: TranscriptLine;
  alignRight?: boolean;
}

export function ImageCard({ line, alignRight }: ImageCardProps) {
  const media = useMediaContext();
  const url = resolveMediaUrl(line.imageUrl);
  const registerImage = media?.registerImage;

  useEffect(() => {
    if (!registerImage || !url) return;
    const downloadUrl = resolveMediaUrl(line.fileUrl ?? line.imageUrl ?? url);
    registerImage({
      id: line.id,
      url,
      caption: line.caption ?? line.text,
      downloadUrl,
      alt: line.caption ?? "image",
    });
  }, [registerImage, line.id, url, line.caption, line.fileUrl, line.imageUrl, line.text]);

  if (!url) return null;

  const openLightbox = () => media?.openAt(line.id);

  const downloadUrl = resolveMediaUrl(line.fileUrl ?? line.imageUrl ?? url);
  const downloadName = line.fileName ?? "image";

  return (
    <figure
      className={`media-image-card${alignRight ? " media-image-card-right" : ""} motion-rise-in-soft`}
    >
      <div className="media-image-frame">
        <button
          type="button"
          className="media-image-trigger"
          onClick={openLightbox}
          aria-label="Open image fullscreen"
        >
          <img
            src={url}
            alt={line.caption ?? "image"}
            loading="lazy"
            className="media-image-img"
          />
        </button>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            className="media-image-download"
            aria-label="Download image"
            title="Download"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void downloadMedia(downloadUrl, downloadName);
            }}
          >
            <IconDownload size={14} />
          </a>
        ) : null}
      </div>
      {line.caption ? (
        <figcaption className="media-image-caption t-meta">
          {line.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
