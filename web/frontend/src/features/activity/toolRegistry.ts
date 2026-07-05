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
    match: /^(code|python|node|js|interpret|compute|eval|execute_code)/i,
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

const SUMMARY_MAX = 260;

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

export interface ParsedActivityTimeline {
  /** Compact card header that summarizes the whole edited progress bubble. */
  primary: ParsedActivity;
  /** Per-tool rows recovered from an accumulated Hermes progress notice. */
  entries: ParsedActivity[];
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
    compact(commandFromArgs(line.toolArgs)) ||
    compact(line.toolError) ||
    compact(previewFromResult(line.toolResult)) ||
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

export function parseStructuredActivityTimeline(line: {
  text: string;
  toolName?: string;
  toolStatus?: ParsedActivity["state"];
  toolArgs?: string;
  toolResult?: string;
  toolError?: string;
  toolDurationMs?: number;
}): ParsedActivityTimeline {
  const structured = parseStructuredActivity(line);
  const entries = parseAccumulatedProgress(line.text, line.toolStatus);
  if (entries.length <= 1) {
    const primary = structured ?? entries[0] ?? parseActivity(line.text);
    return { primary, entries: structured ? [structured] : entries };
  }

  const active = [...entries].reverse().find((entry) => entry.state === "running") ?? entries.at(-1)!;
  const failed = entries.find((entry) => entry.state === "error");
  const state = line.toolStatus ?? failed?.state ?? active.state;
  const rawName = active.rawName;
  const meta = active.meta;
  const primary: ParsedActivity = {
    meta,
    rawName,
    title: state === "running" ? "Working through tools" : failed ? "Tool run failed" : "Tool run complete",
    summary: `${entries.length} tools · ${active.summary || active.rawName}`,
    detail: structuredDetail(line),
    state,
  };
  return { primary, entries };
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
  const fencedSummary = summaryFromDetail(detail);
  const state = detectState(raw);
  return {
    meta,
    rawName: rawName || meta.label,
    title: titleFor(meta, state),
    summary: cleanSummary(summary || fencedSummary || raw.split(/\r?\n/)[0]?.trim() || ""),
    detail,
    state,
  };
}

function parseAccumulatedProgress(text: string, overallStatus?: ParsedActivity["state"]): ParsedActivity[] {
  const groups = splitProgressGroups(text);
  if (groups.length <= 1) {
    return groups.length === 1 ? [withOverallStatus(parseActivity(groups[0]!), overallStatus, true)] : [];
  }
  return groups.map((group, index) => {
    const isLast = index === groups.length - 1;
    const parsed = parseActivity(group);
    const state = statusForTimelineEntry(parsed.state, overallStatus, isLast);
    return { ...parsed, title: titleFor(parsed.meta, state), state };
  });
}

function splitProgressGroups(text: string): string[] {
  const lines = (text ?? "").split(/\r?\n/);
  const groups: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    const value = current.join("\n").trim();
    if (value) groups.push(value);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const startsFence = trimmed.startsWith("```");
    if (!inFence && isLikelyProgressHeader(trimmed)) {
      flush();
      current.push(line);
    } else {
      current.push(line);
    }
    if (startsFence) inFence = !inFence;
  }
  flush();
  return groups;
}

function isLikelyProgressHeader(line: string): boolean {
  if (!line || line.startsWith("```")) return false;
  const stripped = stripLeadingMarker(line);
  if (!stripped) return false;
  // Matches Hermes progress lines such as:
  //   💻 terminal
  //   🔍 search_files: "foo"
  //   text_to_speech: generating voice message
  return /^[\w./-]+(?::|\s+-\s+|\s+→|\.\.\.|$)/.test(stripped);
}

function statusForTimelineEntry(
  parsedState: ParsedActivity["state"],
  overallStatus: ParsedActivity["state"] | undefined,
  isLast: boolean,
): ParsedActivity["state"] {
  if (parsedState === "error") return "error";
  if (overallStatus === "success") return "success";
  if (overallStatus === "error") return isLast ? "error" : "success";
  if (overallStatus === "running") return isLast ? "running" : "success";
  return parsedState === "idle" && isLast ? "running" : parsedState;
}

function withOverallStatus(
  parsed: ParsedActivity,
  overallStatus: ParsedActivity["state"] | undefined,
  isLast: boolean,
): ParsedActivity {
  const state = statusForTimelineEntry(parsed.state, overallStatus, isLast);
  return { ...parsed, title: titleFor(parsed.meta, state), state };
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
  return trimmed.length > SUMMARY_MAX ? `${trimmed.slice(0, SUMMARY_MAX - 1)}…` : trimmed;
}

function cleanSummary(value: string): string {
  const trimmed = value.trim();
  const unquoted = /^(["'])(.*)\1$/.exec(trimmed)?.[2] ?? trimmed;
  return compact(unquoted.replace(/^```[\w-]*\s*/m, "").replace(/```\s*$/m, ""));
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
  const resultPreview = previewFromResult(line.toolResult);
  if (resultPreview) chunks.push(`Result:\n${resultPreview}`);
  return chunks.join("\n\n");
}

function commandFromArgs(value?: string): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const command = (parsed as Record<string, unknown>).command;
      const code = (parsed as Record<string, unknown>).code;
      const path = (parsed as Record<string, unknown>).path;
      const pattern = (parsed as Record<string, unknown>).pattern;
      if (typeof command === "string") return command;
      if (typeof code === "string") return code.split(/\r?\n/)[0] ?? code;
      if (typeof path === "string") return path;
      if (typeof pattern === "string") return pattern;
      const previewKeys = ["url", "ref", "filePath", "entity_id", "query", "prompt", "text"];
      const picked = previewKeys
        .map((key) => [key, (parsed as Record<string, unknown>)[key]] as const)
        .filter(([, val]) => typeof val === "string" && val.trim())
        .map(([key, val]) => `${key}=${String(val)}`);
      if (picked.length > 0) return picked.join(" ");
    }
  } catch {
    // Fall through to raw string compacting.
  }
  return cleanSummary(value);
}

function previewFromResult(value?: string): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const status = obj.exit_code != null ? `exit ${String(obj.exit_code)}` : "";
      const error = typeof obj.error === "string" && obj.error.trim() ? obj.error : "";
      const output = typeof obj.output === "string" ? tailLines(obj.output, 6) : "";
      return [status, error, output].filter(Boolean).join("\n");
    }
  } catch {
    // Not JSON; use the raw text.
  }
  return tailLines(value, 8);
}

function summaryFromDetail(detail: string): string {
  const withoutFence = detail
    .replace(/^```[\w-]*\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  return cleanSummary(withoutFence.split(/\r?\n/).find((line) => line.trim()) ?? "");
}

function tailLines(value: string, maxLines: number): string {
  const lines = value.trim().split(/\r?\n/).filter((line) => line.trim());
  return lines.slice(-maxLines).join("\n");
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
  if (/\b(starting|running|loading|fetching|browsing|searching|reading|writing|calling|generating)\b/.test(t)) {
    return "running";
  }
  return "idle";
}
