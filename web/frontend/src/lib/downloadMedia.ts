import { resolveMediaUrl } from "./resolveMediaUrl";

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url, window.location.href).pathname;
    const base = path.split("/").pop();
    if (base && base.includes(".")) return base;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Trigger a file download for a media URL. Same-origin BFF paths use blob download;
 * other URLs open in a new tab as fallback.
 */
export async function downloadMedia(
  url: string,
  filename?: string,
): Promise<void> {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return;

  const name = filename ?? filenameFromUrl(resolved, "download");

  try {
    const target = new URL(resolved, window.location.href);
    const sameOrigin = target.origin === window.location.origin;

    if (sameOrigin) {
      const res = await fetch(target.href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = name;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
      return;
    }
  } catch {
    /* fall through */
  }

  window.open(resolved, "_blank", "noopener,noreferrer");
}
