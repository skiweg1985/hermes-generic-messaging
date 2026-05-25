import type { TranscriptLine } from "../../types/events";
import { downloadMedia } from "../../lib/downloadMedia";
import { resolveMediaUrl } from "../../lib/resolveMediaUrl";
import {
  IconFile,
  IconImage,
  IconAudio,
  IconDownload,
} from "../shell/icons";

interface FileCardProps {
  line: TranscriptLine;
  alignRight?: boolean;
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kind(mime?: string): "image" | "audio" | "file" {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function label(mime?: string): string {
  if (!mime) return "File";
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "PDF";
  if (m.includes("zip")) return "Archive";
  if (m === "text/plain") return "Text";
  if (m.startsWith("image/")) return (m.split("/")[1] ?? "").toUpperCase() || "Image";
  if (m.startsWith("audio/")) return (m.split("/")[1] ?? "").toUpperCase() || "Audio";
  if (m.startsWith("video/")) return (m.split("/")[1] ?? "").toUpperCase() || "Video";
  if (m.startsWith("text/")) return "Text";
  return (m.split("/")[1] ?? "File").toUpperCase();
}

export function FileCard({ line, alignRight }: FileCardProps) {
  const k = kind(line.mimeType);
  const Icon = k === "image" ? IconImage : k === "audio" ? IconAudio : IconFile;
  const size = formatSize(line.sizeBytes);
  const ext = label(line.mimeType);
  const name = line.fileName ?? "file";
  const downloadUrl = resolveMediaUrl(line.fileUrl);

  const content = (
    <div className={`file-card file-card-${k}`}>
      <div className="file-card-icon" aria-hidden>
        <Icon size={18} />
      </div>
      <div className="file-card-body">
        <div className="file-card-name truncate" title={name}>{name}</div>
        <div className="t-meta file-card-meta truncate">
          {ext}
          {size ? ` · ${size}` : ""}
        </div>
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className="file-card-action"
          aria-label={`Download ${name}`}
          title="Download"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void downloadMedia(downloadUrl, name);
          }}
        >
          <IconDownload size={14} />
        </a>
      ) : null}
    </div>
  );

  return (
    <div
      className={`file-card-wrap${alignRight ? " file-card-wrap-right" : ""} motion-rise-in-soft`}
    >
      {content}
    </div>
  );
}
