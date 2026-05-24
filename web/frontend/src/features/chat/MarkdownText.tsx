import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

interface MarkdownTextProps {
  text: string;
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

export function MarkdownText({ text }: MarkdownTextProps) {
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
        {text}
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
