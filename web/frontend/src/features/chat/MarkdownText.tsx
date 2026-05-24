import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

interface MarkdownTextProps {
  text: string;
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

export function MarkdownText({ text }: MarkdownTextProps) {
  const safe = balanceFencedCode(text);
  return (
    <div className="markdown-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a({ href, children }) {
            if (!href || !isSafeHref(href)) {
              return <span>{children}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {safe}
      </ReactMarkdown>
    </div>
  );
}

function isSafeHref(href: string): boolean {
  try {
    const base =
      typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL(href, base);
    return SAFE_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
}

const FENCE_LINE_RE = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*$/gm;

/**
 * Drop a dangling code-fence opener so the remainder still renders as normal
 * markdown. Noisy LLM output regularly emits an opening ``` with no matching
 * closer; without this fixup, react-markdown swallows the rest of the message
 * into a single <pre><code> block, including bold/links that should format.
 */
export function balanceFencedCode(text: string): string {
  if (!text) return text;
  const fences: { start: number; end: number }[] = [];
  FENCE_LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_LINE_RE.exec(text)) !== null) {
    fences.push({ start: m.index, end: m.index + m[0].length });
  }
  if (fences.length === 0 || fences.length % 2 === 0) return text;
  const orphan = fences[fences.length - 1];
  let cutStart = orphan.start;
  while (cutStart > 0 && (text[cutStart - 1] === " " || text[cutStart - 1] === "\t")) {
    cutStart -= 1;
  }
  let cutEnd = orphan.end;
  if (text[cutEnd] === "\n") cutEnd += 1;
  return `${text.slice(0, cutStart)}${text.slice(cutEnd)}`;
}
