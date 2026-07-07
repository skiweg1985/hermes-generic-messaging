/**
 * Swaps the favicon for a badged variant (unread dot) and restores the
 * original when cleared. The badged icon is drawn once on a canvas and
 * memoized; a generation counter guards against a clear landing while the
 * async build is still in flight. Any failure (no 2d context, decode error,
 * CSP) degrades silently — the tab-title badge still carries the signal.
 */

const SIZE = 64;
const DOT = { x: 49, y: 49, r: 11, ring: 15 };
const RING_COLOR = "#0a0a0c"; // favicon background — punches the dot out
const DOT_COLOR = "#ef8a8a"; // --state-danger

let original: { href: string; type: string | null } | null = null;
let badgedUrl: string | null = null;
let generation = 0;

export async function setFaviconBadge(active: boolean): Promise<void> {
  if (typeof document === "undefined") return;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  original ??= { href: link.href, type: link.getAttribute("type") };
  const gen = ++generation;

  if (!active) {
    link.href = original.href;
    if (original.type) link.setAttribute("type", original.type);
    return;
  }

  try {
    badgedUrl ??= await buildBadgedUrl(original.href);
    if (gen !== generation) return; // superseded by a newer call
    link.setAttribute("type", "image/png");
    link.href = badgedUrl;
  } catch {
    /* degrade to title-only badge */
  }
}

async function buildBadgedUrl(href: string): Promise<string> {
  const img = new Image();
  img.src = href;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  ctx.beginPath();
  ctx.arc(DOT.x, DOT.y, DOT.ring, 0, Math.PI * 2);
  ctx.fillStyle = RING_COLOR;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(DOT.x, DOT.y, DOT.r, 0, Math.PI * 2);
  ctx.fillStyle = DOT_COLOR;
  ctx.fill();
  return canvas.toDataURL("image/png");
}
