import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import type { TranscriptLine } from "../../types/events";
import { downloadMedia } from "../../lib/downloadMedia";
import { resolveMediaUrl } from "../../lib/resolveMediaUrl";
import { IconDownload } from "../shell/icons";
import { useMediaContext, type MediaImage } from "./MediaProvider";

interface ImageCardProps {
  line: TranscriptLine;
  alignRight?: boolean;
}

const TAP_MOVE_TOLERANCE = 8;

export function ImageCard({ line, alignRight }: ImageCardProps) {
  const media = useMediaContext();
  const tapRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const url = resolveMediaUrl(line.imageUrl);
  const registerImage = media?.registerImage;

  const downloadUrl = resolveMediaUrl(line.fileUrl ?? line.imageUrl ?? url);
  const downloadName = line.fileName ?? "image";
  const image = useMemo<MediaImage | null>(
    () =>
      url
        ? {
            id: line.id,
            url,
            caption: line.caption ?? line.text,
            downloadUrl,
            alt: line.caption ?? "image",
          }
        : null,
    [downloadUrl, line.caption, line.id, line.text, url],
  );

  useEffect(() => {
    if (!registerImage || !image) return;
    registerImage(image);
  }, [registerImage, image]);

  if (!url || !image) return null;

  const openLightbox = () => {
    media?.openImage(image);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    tapRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap || tap.pointerId !== event.pointerId) return;

    const dx = Math.abs(event.clientX - tap.x);
    const dy = Math.abs(event.clientY - tap.y);
    if (dx > TAP_MOVE_TOLERANCE || dy > TAP_MOVE_TOLERANCE) return;

    // iOS Safari can drop/delay the synthetic click when the message wrapper
    // also handles pointer gestures. Open immediately on a real tap and ignore
    // the follow-up click to avoid double-opening.
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;
    openLightbox();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  return (
    <figure
      className={`media-image-card${alignRight ? " media-image-card-right" : ""} motion-rise-in-soft`}
    >
      <div className="media-image-frame">
        <button
          type="button"
          className="media-image-trigger"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            tapRef.current = null;
          }}
          onClick={(event) => {
            if (suppressClickRef.current) {
              event.preventDefault();
              return;
            }
            openLightbox();
          }}
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
