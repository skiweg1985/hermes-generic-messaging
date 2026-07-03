import { SLASH_COMMANDS, type SlashCommand } from "./slashCommands";

function commandTokens(command: SlashCommand): string[] {
  return [
    command.name,
    command.description,
    command.category ?? "",
    command.usage ?? "",
    ...(command.aliases ?? []),
  ]
    .join(" ")
    .split(/\s+/)
    .map((token) => token.replace(/^\//, "").toLowerCase())
    .filter(Boolean);
}

/** Active while the user is typing the first token of a slash command. */
export function getSlashSuggestionQuery(
  value: string,
  cursor: number,
): string | null {
  if (!value.startsWith("/")) return null;
  const head = value.slice(0, Math.max(0, cursor));
  if (head.includes(" ")) return null;
  return head.slice(1);
}

export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.replace(/^\//, "").toLowerCase();
  return SLASH_COMMANDS.map((cmd) => ({ cmd, score: scoreCommand(cmd, needle) }))
    .filter((entry) => entry.score < Number.POSITIVE_INFINITY)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.cmd.featured !== b.cmd.featured) return a.cmd.featured ? -1 : 1;
      return a.cmd.name.localeCompare(b.cmd.name);
    })
    .map((entry) => entry.cmd);
}

export function applySlashCommand(value: string, command: SlashCommand): string {
  const rest = value.includes(" ") ? value.slice(value.indexOf(" ")) : "";
  return `${command.name}${rest}`;
}

function scoreCommand(command: SlashCommand, needle: string): number {
  if (needle === "") return command.featured ? 0 : 10;
  const name = command.name.replace(/^\//, "").toLowerCase();
  if (name.startsWith(needle)) return 0;
  const aliases = (command.aliases ?? []).map((alias) =>
    alias.replace(/^\//, "").toLowerCase(),
  );
  if (aliases.some((alias) => alias.startsWith(needle))) return 1;
  const tokens = commandTokens(command);
  if (tokens.some((token) => token.startsWith(needle))) return 2;
  const haystack = tokens.join(" ");
  if (haystack.includes(needle)) return 3;
  return Number.POSITIVE_INFINITY;
}
