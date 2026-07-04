import { useLayoutEffect } from "react";

/**
 * Publishes the composer dock height as the `--composer-clearance` CSS variable
 * so the transcript can reserve matching bottom padding. Owned by the composer
 * layer; the variable is set on the document root so any descendant can read it.
 */
export function useComposerClearance(ref: React.RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = el.getBoundingClientRect().height;
        document.documentElement.style.setProperty(
          "--composer-clearance",
          `${Math.ceil(height)}px`,
        );
      });
    };

    publish();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    window.addEventListener("resize", publish);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--composer-clearance");
    };
  }, [ref]);
}
