export interface SlashCommand {
  name: string;
  description: string;
  category?: "Core" | "Session" | "Voice" | "Model" | "Automation" | "Runtime" | "Admin";
  usage?: string;
  featured?: boolean;
  aliases?: string[];
}

/**
 * Slash commands shown in the composer menu and inspector.
 *
 * Hermes executes slash commands server-side. Keep this list focused on
 * Telegram/gateway-compatible commands plus existing web affordances.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/help", description: "Show available commands", category: "Core", featured: true },
  { name: "/commands", description: "Browse all commands and skills", category: "Core" },
  { name: "/start", description: "Start or acknowledge the chat bridge", category: "Core" },
  { name: "/new", description: "Start a new session", category: "Session", featured: true },
  { name: "/reset", description: "Reset the conversation context", category: "Session" },
  { name: "/clear", description: "Clear the conversation", category: "Session" },
  { name: "/resume", description: "Resume a named session", category: "Session", usage: "/resume <name>" },
  {
    name: "/sessions",
    description: "Browse and resume previous sessions",
    category: "Session",
    featured: true,
    aliases: ["/session", "/switch"],
  },
  { name: "/title", description: "Show or set the current session title", category: "Session", usage: "/title <name>" },
  { name: "/status", description: "Show session, model, and context info", category: "Core" },
  { name: "/model", description: "Set or show the active model", category: "Model", usage: "/model <provider/model>", featured: true },
  { name: "/retry", description: "Retry the last user turn", category: "Core", featured: true },
  { name: "/undo", description: "Back up user turns and re-prompt", category: "Session" },
  { name: "/branch", description: "Branch the current session", category: "Session", aliases: ["/fork"] },
  { name: "/compress", description: "Compress the conversation context", category: "Session" },
  { name: "/rollback", description: "List or restore filesystem checkpoints", category: "Runtime" },
  { name: "/stop", description: "Stop background processes", category: "Runtime", featured: true },
  { name: "/approve", description: "Approve a pending command or action", category: "Runtime" },
  { name: "/deny", description: "Deny a pending command or action", category: "Runtime" },
  { name: "/queue", description: "Queue a prompt for the next turn", category: "Automation", usage: "/queue <prompt>", aliases: ["/q"] },
  { name: "/steer", description: "Steer the current run after the next tool call", category: "Automation", usage: "/steer <instruction>" },
  {
    name: "/background",
    description: "Run a prompt in the background",
    category: "Automation",
    usage: "/background <prompt>",
    aliases: ["/bg", "/btw"],
  },
  { name: "/agents", description: "Show active agents and running tasks", category: "Automation", aliases: ["/tasks"] },
  { name: "/goal", description: "Set or inspect the standing goal", category: "Automation", usage: "/goal <objective>" },
  { name: "/subgoal", description: "Add or manage active goal criteria", category: "Automation" },
  { name: "/moa", description: "Run a Mixture of Agents prompt", category: "Automation" },
  { name: "/profile", description: "Show active profile and home directory", category: "Core" },
  { name: "/whoami", description: "Show your slash-command access", category: "Core" },
  {
    name: "/codex-runtime",
    description: "Toggle Codex app-server runtime mode",
    category: "Runtime",
    aliases: ["/codex_runtime"],
  },
  { name: "/personality", description: "Set a predefined personality", category: "Model" },
  { name: "/footer", description: "Toggle gateway runtime metadata footer", category: "Runtime" },
  { name: "/voice", description: "Toggle or inspect voice mode", category: "Voice", usage: "/voice on|tts|off|status", featured: true, aliases: ["/tts"] },
  { name: "/reasoning", description: "Manage reasoning effort and display", category: "Model", usage: "/reasoning low|medium|high|off" },
  { name: "/fast", description: "Toggle fast mode", category: "Model" },
  { name: "/yolo", description: "Toggle approval-skipping YOLO mode", category: "Runtime" },
  { name: "/usage", description: "Show token usage and rate limits", category: "Core" },
  { name: "/credits", description: "Show Nous credit balance", category: "Core" },
  { name: "/insights", description: "Show usage insights and analytics", category: "Core" },
  { name: "/version", description: "Show Hermes Agent version", category: "Core", aliases: ["/v"] },
  { name: "/debug", description: "Upload a debug report", category: "Admin" },
  { name: "/restart", description: "Gracefully restart the gateway", category: "Admin" },
  { name: "/update", description: "Update Hermes Agent", category: "Admin" },
  {
    name: "/reload-mcp",
    description: "Reload MCP servers",
    category: "Admin",
    aliases: ["/reload_mcp"],
  },
  {
    name: "/reload-skills",
    description: "Re-scan installed skills",
    category: "Admin",
    aliases: ["/reload_skills"],
  },
  { name: "/memory", description: "Review pending memory writes", category: "Automation" },
  { name: "/bundles", description: "List skill bundles", category: "Automation" },
  { name: "/learn", description: "Learn a reusable skill from context", category: "Automation", usage: "/learn <skill>" },
  {
    name: "/suggestions",
    description: "Review suggested automations",
    category: "Automation",
    aliases: ["/suggest"],
  },
  { name: "/blueprint", description: "Set up an automation blueprint", category: "Automation", aliases: ["/bp"] },
  { name: "/curator", description: "Manage background skill maintenance", category: "Automation" },
  { name: "/kanban", description: "Manage the multi-profile collaboration board", category: "Automation" },
  { name: "/platform", description: "Pause, resume, or list gateway platforms", category: "Admin", usage: "/platform list|pause|resume" },
];
