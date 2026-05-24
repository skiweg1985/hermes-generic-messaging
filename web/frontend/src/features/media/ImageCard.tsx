import { useEffect } from "react";
import type { TranscriptLine } from "../../types/events";
import { IconDownload } from "../shell/icons";
import { useMediaContext } from "./MediaProvider";

interface ImageCardProps {
  line: TranscriptLine;
}

export function ImageCard({ line }: ImageCardProps) {
  const media = useMediaContext();
  const url = line.imageUrl;
  const registerImage = media?.registerImage;

  useEffect(() => {
    if (!registerImage || !url) return;
    registerImage({
      id: line.id,
      url,
      caption: line.caption ?? line.text,
      downloadUrl: line.fileUrl ?? url,
      alt: line.caption ?? "image",
    });
  }, [registerImage, line.id, url, line.caption, line.fileUrl, line.text]);

  if (!url) return null;

  const openLightbox = () => media?.openAt(line.id);

  return (
    <figure className="media-image-card motion-rise-in-soft">
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
        {line.fileUrl || url ? (
          <a
            href={line.fileUrl ?? url}
            target="_blank"
            rel="noreferrer"
            className="media-image-download"
            aria-label="Download image"
            title="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <IconDownload size={14} />
          </a>
        ) : null}
      </button>
      {line.caption ? (
        <figcaption className="media-image-caption t-meta">
          {line.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
