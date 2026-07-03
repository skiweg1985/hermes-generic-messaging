import type { SlashCommand } from "../chat/slashCommands";
import { IconSlash } from "../shell/icons";

interface SlashPopoverProps {
  suggestions: SlashCommand[];
  highlightIndex: number;
  onPick: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

export function SlashPopover({
  suggestions,
  highlightIndex,
  onPick,
  onHover,
}: SlashPopoverProps) {
  if (suggestions.length === 0) return null;

  return (
    <ul
      id="composer-slash-list"
      className="slash-popover motion-rise-in-soft"
      role="listbox"
      aria-label="Slash commands"
    >
      {suggestions.map((cmd, index) => (
        <li key={cmd.name} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={index === highlightIndex}
            className={`slash-popover-item${index === highlightIndex ? " slash-popover-item-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(cmd)}
          >
            <span className="slash-popover-icon" aria-hidden>
              <IconSlash size={12} />
            </span>
            <span className="slash-popover-cmd t-mono-sm">{cmd.name}</span>
            <span className="slash-popover-desc truncate">
              <span className="slash-popover-title">{cmd.description}</span>
              <span className="slash-popover-meta t-meta">
                {cmd.category ?? "Hermes"}
                {cmd.usage ? ` - ${cmd.usage}` : ""}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
