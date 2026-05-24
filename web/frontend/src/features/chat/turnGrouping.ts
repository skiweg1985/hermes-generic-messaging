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

function isUserAnchor(line: TranscriptLine): boolean {
  return line.kind === "user" || line.kind === "command" || line.kind === "upload";
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
