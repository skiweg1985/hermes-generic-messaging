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
    match: /^(web|browser|browse|web_search|search_web|fetch|http|webfetch|navigate)/i,
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
    match: /^(audio|tts|stt|transcribe|speech)/i,
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
}): ParsedActivity | null {
  if (!line.toolName && !line.toolStatus) return null;
  const parsed = parseActivity(line.text);
  const status = line.toolStatus ?? parsed.state;
  return {
    ...parsed,
    rawName: line.toolName ?? parsed.rawName,
    title:
      status === "running" || status === "idle"
        ? parsed.meta.presentLabel ?? parsed.meta.label
        : parsed.meta.pastLabel ?? parsed.meta.label,
    summary: parsed.summary || line.toolName || "",
    detail: line.toolResult ?? line.toolArgs ?? parsed.detail,
    state: status,
  };
}

export function parseActivity(text: string): ParsedActivity {
  const raw = text ?? "";
  const lines = raw.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";

  // Try to split "tool_name: rest" or "tool_name → rest".
  const split =
    /^([\w./:-]+)\s*(?:[:→\-]\s*|\s+)(.*)$/.exec(firstLine);
  const rawName = split?.[1] ?? firstLine;
  const summary = split?.[2]?.trim() ?? "";
  const detail = lines.slice(1).join("\n").trim();

  let meta: ToolMeta = GENERIC;
  for (const entry of REGISTRY) {
    if (entry.match.test(rawName)) {
      meta = entry.meta;
      break;
    }
  }

  const state = detectState(raw);
  return {
    meta,
    rawName: rawName || meta.label,
    title:
      state === "running" || state === "idle"
        ? meta.presentLabel ?? meta.label
        : meta.pastLabel ?? meta.label,
    summary: summary || raw.split(/\r?\n/)[0]?.trim() || "",
    detail,
    state,
  };
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
  if (/\b(starting|running|loading|fetching|reading|writing|calling)\b/.test(t)) {
    return "running";
  }
  return "running";
}
