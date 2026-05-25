const BFF_MEDIA_PATH = /^\/api\/v1\/media\/([^/?#]+)/;

/**
 * Rewrite BFF media URLs to same-origin paths so Vite's `/api` proxy serves them.
 * Cross-origin absolute URLs break `<a download>` even when `<img src>` still loads.
 */
export function resolveMediaUrl(url: string | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("/api/v1/media/")) return trimmed;

  try {
    const parsed = new URL(trimmed, window.location.href);
    const match = parsed.pathname.match(BFF_MEDIA_PATH);
    if (match) {
      return `/api/v1/media/${match[1]}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* keep original */
  }

  return trimmed;
}
