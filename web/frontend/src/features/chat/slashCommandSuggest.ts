import { SLASH_COMMANDS, type SlashCommand } from "./slashCommands";

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
  const needle = query.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => {
    const token = cmd.name.slice(1).toLowerCase();
    return needle === "" || token.startsWith(needle);
  });
}

export function applySlashCommand(value: string, command: SlashCommand): string {
  const rest = value.includes(" ") ? value.slice(value.indexOf(" ")) : "";
  return `${command.name}${rest}`;
}
