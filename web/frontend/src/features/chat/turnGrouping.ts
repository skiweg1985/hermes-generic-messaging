import type { TranscriptLine } from "../../types/events";

/**
 * Group a flat transcript into turns:
 *   - A "turn" starts at a user/command/upload entry and continues until the
 *     next user/command/upload (or end of list).
 *   - Errors and stray system events outside any turn become their own turn
 *     with no `user` side.
 */

export interface Turn {
  id: string;
  user: TranscriptLine | null;
  outputs: TranscriptLine[];
}

export function isUserMediaLine(line: TranscriptLine): boolean {
  if (line.role === "user") return true;
  return line.kind === "audio-out" && line.text.startsWith("user>");
}

function isUserAnchor(line: TranscriptLine): boolean {
  if (line.kind === "user" || line.kind === "command" || line.kind === "upload") {
    return true;
  }
  if (isUserMediaLine(line) && (line.kind === "image" || line.kind === "audio-out")) {
    return true;
  }
  return false;
}

export function groupTurns(lines: TranscriptLine[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const line of lines) {
    if (line.kind === "empty") continue;

    if (isUserAnchor(line)) {
      if (current) turns.push(current);
      current = { id: line.id, user: line, outputs: [] };
      continue;
    }

    if (!current) {
      // Orphan assistant output (e.g. first message restored from storage,
      // or a system push). Create a turn with no user anchor.
      current = { id: `orphan-${line.id}`, user: null, outputs: [line] };
      continue;
    }

    current.outputs.push(line);
  }

  if (current) turns.push(current);
  return turns;
}
