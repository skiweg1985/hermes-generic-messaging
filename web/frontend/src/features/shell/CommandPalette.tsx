import { useEffect, useMemo, useRef, useState } from "react";
import { SLASH_COMMANDS } from "../chat/slashCommands";
import { IconSearch, IconSlash, IconPlus, IconClose } from "./icons";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateChat: () => void;
  onRunCommand: (command: string) => void;
  onSelectChat: (chatId: string) => void;
  sessions: Array<{ chatId: string; label: string }>;
}

interface Item {
  id: string;
  group: "actions" | "commands" | "chats";
  label: string;
  hint?: string;
  search?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onCreateChat,
  onRunCommand,
  onSelectChat,
  sessions,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items: Item[] = useMemo(() => {
    const actions: Item[] = [
      {
        id: "action:new-chat",
        group: "actions",
        label: "New chat",
        hint: "⌘N",
        run: () => {
          onCreateChat();
          onClose();
        },
      },
    ];
    const commands: Item[] = SLASH_COMMANDS.map((c) => ({
      id: `cmd:${c.name}`,
      group: "commands",
      label: c.name,
      hint: c.usage ?? `${c.category ?? "Hermes"} - ${c.description}`,
      search: [c.name, c.description, c.category, c.usage, ...(c.aliases ?? [])].join(" "),
      run: () => {
        onRunCommand(c.name);
        onClose();
      },
    }));
    const chats: Item[] = sessions.map((s) => ({
      id: `chat:${s.chatId}`,
      group: "chats",
      label: s.label || s.chatId,
      hint: "Switch",
      run: () => {
        onSelectChat(s.chatId);
        onClose();
      },
    }));
    const all = [...actions, ...commands, ...chats];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.hint ?? "").toLowerCase().includes(q) ||
        (it.search ?? "").toLowerCase().includes(q),
    );
  }, [query, sessions, onCreateChat, onRunCommand, onSelectChat, onClose]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        items.length === 0 ? 0 : (i - 1 + items.length) % items.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="palette-backdrop motion-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette motion-scale-in">
        <div className="palette-search">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            type="text"
            className="palette-input t-body"
            placeholder="Search chats, run commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="palette-close"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose size={14} />
          </button>
        </div>

        <div className="palette-results" role="listbox">
          {items.length === 0 ? (
            <div className="palette-empty t-meta">No matches</div>
          ) : (
            renderGrouped(items, active, setActive)
          )}
        </div>

        <div className="palette-footer t-meta">
          <span>↑↓ navigate</span>
          <span>⏎ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function renderGrouped(
  items: Item[],
  active: number,
  setActive: (i: number) => void,
) {
  const groups: Record<string, Item[]> = { actions: [], commands: [], chats: [] };
  for (const it of items) groups[it.group].push(it);
  const titles: Record<string, string> = {
    actions: "Actions",
    commands: "Slash commands",
    chats: "Conversations",
  };
  let flatIndex = -1;
  return (
    <>
      {(["actions", "commands", "chats"] as const).map((g) =>
        groups[g].length > 0 ? (
          <div key={g} className="palette-group">
            <div className="t-label palette-group-label">{titles[g]}</div>
            {groups[g].map((it) => {
              flatIndex += 1;
              const isActive = flatIndex === active;
              const idx = flatIndex;
              return (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`palette-item${isActive ? " palette-item-active" : ""}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => it.run()}
                >
                  <span className="palette-item-icon" aria-hidden>
                    {g === "commands" ? (
                      <IconSlash size={14} />
                    ) : g === "actions" ? (
                      <IconPlus size={14} />
                    ) : (
                      <IconSearch size={14} />
                    )}
                  </span>
                  <span className="palette-item-label truncate">{it.label}</span>
                  {it.hint ? (
                    <span className="palette-item-hint t-meta truncate">
                      {it.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null,
      )}
    </>
  );
}
