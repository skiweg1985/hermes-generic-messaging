import { Children, isValidElement, useState, type ReactNode } from "react";
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
          pre({ children }) {
            return <>{children}</>;
          },
          p({ children }) {
            return <MarkdownParagraph>{children}</MarkdownParagraph>;
          },
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
          img({ src, alt }) {
            if (!src || !isSafeHref(src)) return null;
            return <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" />;
          },
          table({ children }) {
            return (
              <div className="markdown-table-wrap">
                <table>{children}</table>
              </div>
            );
          },
          code(props) {
            const { className, children, node: _node, ...rest } = props as {
              className?: string;
              children?: ReactNode;
              node?: unknown;
            };
            const raw = String(children ?? "");
            const match = /language-([\w-]+)/.exec(className ?? "");
            if (match) {
              return <CodeBlock code={raw.replace(/\n$/, "")} language={match[1] ?? ""} />;
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {safe}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownParagraph({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(
    (child) => !(typeof child === "string" && child.trim() === ""),
  );
  const only = items.length === 1 ? items[0] : null;
  const text = textFromNode(children).trim();
  if (
    /^https?:\/\/\S+$/i.test(text) &&
    isValidElement<{ href?: string; children?: ReactNode }>(only) &&
    only.props.href
  ) {
    return (
      <p className="markdown-link-preview">
        {only}
        <span className="markdown-link-host">{hostForHref(only.props.href)}</span>
      </p>
    );
  }
  return <p>{children}</p>;
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
  return "";
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const label = language ? language.toUpperCase() : "CODE";
  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-language">{label}</span>
        <button
          type="button"
          className="markdown-code-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{highlightCode(code, language)}</code>
      </pre>
    </div>
  );
}

function highlightCode(code: string, language: string): ReactNode[] {
  if (!code) return [""];
  const lang = language.toLowerCase();
  const keywordPattern =
    lang.includes("py")
      ? /\b(async|await|class|def|return|if|elif|else|for|while|try|except|finally|with|import|from|as|True|False|None|lambda|yield|raise)\b/g
      : lang.includes("json")
        ? /\b(true|false|null)\b/g
        : /\b(async|await|class|const|let|var|function|return|if|else|for|while|try|catch|finally|import|from|export|default|type|interface|extends|new|true|false|null|undefined)\b/g;
  const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|\/\*[\s\S]*?\*\/|\b\d+(?:\.\d+)?\b)/g;
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of code.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push(...highlightKeywords(code.slice(cursor, start), keywordPattern));
    }
    const value = match[0];
    const cls =
      value.startsWith("//") || value.startsWith("#") || value.startsWith("/*")
        ? "syntax-comment"
        : /^\d/.test(value)
          ? "syntax-number"
          : "syntax-string";
    parts.push(
      <span key={`t-${start}`} className={cls}>
        {value}
      </span>,
    );
    cursor = start + value.length;
  }
  if (cursor < code.length) {
    parts.push(...highlightKeywords(code.slice(cursor), keywordPattern));
  }
  return parts;
}

function highlightKeywords(text: string, pattern: RegExp): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <span key={`k-${parts.length}-${start}`} className="syntax-keyword">
        {match[0]}
      </span>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
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

function hostForHref(href: string): string {
  try {
    const base =
      typeof window === "undefined" ? "http://localhost" : window.location.origin;
    return new URL(href, base).host;
  } catch {
    return href;
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
