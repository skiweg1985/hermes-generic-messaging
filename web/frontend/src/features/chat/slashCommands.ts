export interface SlashCommand {
  name: string;
  description: string;
}

/** Slash commands shown in the composer menu and inspector. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/model", description: "Set or show the active model" },
  { name: "/reset", description: "Reset the conversation context" },
  { name: "/reload-mcp", description: "Reload MCP servers" },
  { name: "/new", description: "Start a new session" },
  { name: "/clear", description: "Clear the conversation" },
  { name: "/commands", description: "Show all commands" },
];
