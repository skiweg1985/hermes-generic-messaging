export interface QuoteContext {
  /** Line-ID der zitierten Original-Nachricht (für Scroll-zum-Original). */
  lineId?: string;
  label?: string;
  preview?: string;
}

const FLASH_CLASS = "msg-quote-target-flash";
const FLASH_MS = 1400;

/** Scrollt zur zitierten Original-Nachricht und lässt sie kurz aufblitzen. */
export function scrollToQuotedLine(lineId: string): void {
  // Eine Zeile kann mehrere Surfaces rendern (z.B. Caption + Audio-Karte, die
  // sich die Line-ID teilen) — zum ersten scrollen, alle aufblitzen lassen.
  const els = document.querySelectorAll<HTMLElement>(`[data-line-id="${CSS.escape(lineId)}"]`);
  if (els.length === 0) return;
  els[0]!.scrollIntoView({ behavior: "smooth", block: "center" });
  for (const el of els) {
    el.classList.remove(FLASH_CLASS);
    // Reflow, damit ein erneuter Klick die Animation neu startet.
    void el.offsetWidth;
    el.classList.add(FLASH_CLASS);
  }
  window.setTimeout(() => {
    for (const el of els) el.classList.remove(FLASH_CLASS);
  }, FLASH_MS);
}

/**
 * Telegram-artiges Zitat der Original-Nachricht, eingebettet oben in der
 * Reply-Bubble: Akzentbalken, Absender, einzeilige Vorschau. Klick springt
 * zur Original-Nachricht, sofern sie noch im Transcript steht.
 */
export function MessageQuote({ quote }: { quote: QuoteContext }) {
  const { lineId, label, preview } = quote;
  if (!label && !preview) return null;
  const clickable = Boolean(lineId);
  return (
    <button
      type="button"
      className="msg-quote"
      aria-label={`In reply to ${label ?? "message"}`}
      disabled={!clickable}
      onClick={clickable ? () => scrollToQuotedLine(lineId!) : undefined}
    >
      {label ? <span className="msg-quote-label">{label}</span> : null}
      {preview ? <span className="msg-quote-preview">{preview}</span> : null}
    </button>
  );
}
