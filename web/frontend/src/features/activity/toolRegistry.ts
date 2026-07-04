import type { ReactNode } from "react";
import {
  IconGlobe,
  IconTerminal,
  IconFile,
  IconSparkle,
  IconImage,
  IconAudio,
  IconAgents,
  IconCommand,
} from "../shell/icons";

export type ActivityKind =
  | "web"
  | "shell"
  | "file"
  | "code"
  | "media"
  | "audio"
  | "agent"
  | "mcp"
  | "generic";

export interface ToolMeta {
  kind: ActivityKind;
  label: string;
  /** Verb shown while running ("Browsing the web"). */
  presentLabel?: string;
  /** Verb shown when finished ("Browsed the web"). */
  pastLabel?: string;
  icon: (props: { size?: number }) => ReactNode;
}

const REGISTRY: Array<{
  match: RegExp;
  meta: Omit<ToolMeta, "icon"> & { icon: ToolMeta["icon"] };
}> = [
  {
    match: /^(web|browser|browse|browsing|web_search|search_web|searching|fetch|http|webfetch|navigate)/i,
    meta: {
      kind: "web",
      label: "Web",
      presentLabel: "Browsing the web",
      pastLabel: "Browsed the web",
      icon: IconGlobe,
    },
  },
  {
    match: /^(file|read|write|edit|grep|glob|search|list_dir|view)/i,
    meta: {
      kind: "file",
      label: "Files",
      presentLabel: "Reading files",
      pastLabel: "Read files",
      icon: IconFile,
    },
  },
  {
    match: /^(shell|bash|terminal|exec|run|command|cmd)/i,
    meta: {
      kind: "shell",
      label: "Shell",
      presentLabel: "Running command",
      pastLabel: "Ran command",
      icon: IconTerminal,
    },
  },
  {
    match: /^(code|python|node|js|interpret|compute|eval)/i,
    meta: {
      kind: "code",
      label: "Compute",
      presentLabel: "Executing code",
      pastLabel: "Executed code",
      icon: IconCommand,
    },
  },
  {
    match: /^(image|render|draw|generate_image|sd|dalle)/i,
    meta: {
      kind: "media",
      label: "Image",
      presentLabel: "Generating image",
      pastLabel: "Generated image",
      icon: IconImage,
    },
  },
  {
    match: /^(audio|tts|stt|transcribe|speech|voice|text_to_speech|speech_to_text)/i,
    meta: {
      kind: "audio",
      label: "Audio",
      presentLabel: "Working with audio",
      pastLabel: "Processed audio",
      icon: IconAudio,
    },
  },
  {
    match: /^(agent|sub|delegate|spawn|task)/i,
    meta: {
      kind: "agent",
      label: "Agent",
      presentLabel: "Delegating",
      pastLabel: "Delegated",
      icon: IconAgents,
    },
  },
  {
    match: /^mcp/i,
    meta: {
      kind: "mcp",
      label: "MCP",
      presentLabel: "Calling MCP tool",
      pastLabel: "Called MCP tool",
      icon: IconCommand,
    },
  },
];

const GENERIC: ToolMeta = {
  kind: "generic",
  label: "Tool",
  presentLabel: "Computing",
  pastLabel: "Computed",
  icon: IconSparkle,
};

export interface ParsedActivity {
  meta: ToolMeta;
  /** Raw tool name as the agent reported it (kept for "expanded" view). */
  rawName: string;
  /** Human title combining tool kind + raw name (e.g. "Browsing the web · web_search"). */
  title: string;
  /** One-line current summary (the operation's payload). */
  summary: string;
  /** Multi-line detail body (everything after the first line). */
  detail: string;
  state: "running" | "success" | "error" | "idle";
}

export function parseStructuredActivity(line: {
  text: string;
  toolName?: string;
  toolStatus?: ParsedActivity["state"];
  toolArgs?: string;
  toolResult?: string;
  toolError?: string;
  toolDurationMs?: number;
}): ParsedActivity | null {
  if (!line.toolName && !line.toolStatus) return null;
  const parsed = parseActivity(line.text);
  const status = line.toolStatus ?? parsed.state;
  const rawName = line.toolName ?? parsed.rawName;
  const meta = metaFor(rawName);
  const summary =
    parsed.summary ||
    compact(line.toolError) ||
    compact(line.toolResult) ||
    compact(line.toolArgs) ||
    (line.toolName ? humanizeToolName(line.toolName) : "");
  const detail = structuredDetail(line) || parsed.detail;
  return {
    ...parsed,
    meta,
    rawName,
    title: titleFor(meta, status),
    summary,
    detail,
    state: status,
  };
}

export function parseActivity(text: string): ParsedActivity {
  const raw = text ?? "";
  const lines = raw.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const normalizedFirstLine = stripLeadingMarker(firstLine);

  // Try to split "tool_name: rest" or "tool_name → rest".
  const split =
    /^([\w./-]+)\s*(?:[:→]\s*|\s+-\s*|\s+)(.*)$/.exec(normalizedFirstLine);
  const rawName = split?.[1] ?? normalizedFirstLine;
  const summary = split?.[2]?.trim() ?? "";
  const detail = lines.slice(1).join("\n").trim();

  const meta = metaFor(rawName);

  const state = detectState(raw);
  return {
    meta,
    rawName: rawName || meta.label,
    title: titleFor(meta, state),
    summary: summary || raw.split(/\r?\n/)[0]?.trim() || "",
    detail,
    state,
  };
}

function metaFor(rawName: string): ToolMeta {
  for (const entry of REGISTRY) {
    if (entry.match.test(rawName)) {
      return entry.meta;
    }
  }
  return GENERIC;
}

function titleFor(meta: ToolMeta, state: ParsedActivity["state"]): string {
  return state === "running" || state === "idle"
    ? meta.presentLabel ?? meta.label
    : meta.pastLabel ?? meta.label;
}

function stripLeadingMarker(value: string): string {
  return value.replace(/^[^\w/.-]+/u, "").trim();
}

function compact(value?: string): string {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed) return "";
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
}

function humanizeToolName(value: string): string {
  return value.replace(/[_-]+/g, " ");
}

function structuredDetail(line: {
  toolArgs?: string;
  toolResult?: string;
  toolError?: string;
}): string {
  const chunks: string[] = [];
  if (line.toolError?.trim()) chunks.push(`Error:\n${line.toolError.trim()}`);
  if (line.toolArgs?.trim()) chunks.push(`Args:\n${line.toolArgs.trim()}`);
  if (line.toolResult?.trim()) chunks.push(`Result:\n${line.toolResult.trim()}`);
  return chunks.join("\n\n");
}

function detectState(text: string): ParsedActivity["state"] {
  const t = text.toLowerCase();
  if (
    /\b(error|failed|exception|denied|timeout|refused)\b/.test(t) ||
    /❌|⛔|⚠️/.test(text)
  ) {
    return "error";
  }
  if (
    /\b(done|finished|completed|ok|success|succeeded)\b/.test(t) ||
    /✓|✔|✅/.test(text)
  ) {
    return "success";
  }
  if (/\b(starting|running|loading|fetching|browsing|searching|reading|writing|calling)\b/.test(t)) {
    return "running";
  }
  return "idle";
}
