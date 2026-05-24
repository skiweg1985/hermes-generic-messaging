import { useCallback, useRef, useState, type DragEvent } from "react";
import { Rail } from "../shell/Rail";
import { TopBar } from "../shell/TopBar";
import { CommandPalette } from "../shell/CommandPalette";
import { SessionPeek } from "../shell/SessionPeek";
import { ConnectionBanner } from "../shell/ConnectionBanner";
import { Composer, type ComposerHandle } from "../composer/Composer";
import { DropOverlay } from "../composer/DropOverlay";
import { Transcript } from "./Transcript";
import { useChatController } from "./useChatController";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import "../shell/shell.css";
import "../composer/composer.css";
import "../media/media.css";

function displayChatId(chatId: string): string {
  return chatId.includes(":") ? chatId.split(":").pop() ?? chatId : chatId;
}

export function ChatPage() {
  const ctrl = useChatController();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const dragCounter = useRef(0);
  const composerRef = useRef<ComposerHandle>(null);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openPeek = useCallback(() => setPeekOpen(true), []);
  const closePeek = useCallback(() => setPeekOpen(false), []);

  useKeyboardShortcuts([
    { combo: "mod+k", handler: () => setPaletteOpen((v) => !v), whenTyping: true },
    { combo: "mod+n", handler: () => ctrl.createChat(), whenTyping: true },
    { combo: "mod+i", handler: () => setPeekOpen((v) => !v), whenTyping: true },
    { combo: "mod+.", handler: () => ctrl.cancel(), whenTyping: true },
    {
      combo: "mod+l",
      handler: () => composerRef.current?.focus(),
      whenTyping: true,
    },
    {
      combo: "mod+/",
      handler: () => {
        if (!ctrl.activeSession.input.trim()) ctrl.setInput("/");
        composerRef.current?.focus();
      },
      whenTyping: true,
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      combo: `mod+${i + 1}`,
      handler: () => {
        const target = ctrl.sessions[i];
        if (target) ctrl.setActiveChat(target.chatId);
      },
      whenTyping: true,
    })),
  ]);

  const activeSession = ctrl.activeSession;
  const title = activeSession.label || displayChatId(activeSession.chatId);

  // ── Drag-and-drop attach on the stage ────────────────────────────────
  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    dragCounter.current += 1;
    setDropOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDropOver(false);
    }
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDropOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ctrl.uploadFile(file);
  };

  return (
    <div className="shell-root">
      <Rail
        userId={ctrl.userId}
        workspaceName="Hermes"
        sessions={ctrl.sessions}
        activeChatId={ctrl.activeChatId}
        onSelectSession={ctrl.setActiveChat}
        onCreateChat={ctrl.createChat}
        onOpenPalette={openPalette}
      />

      <section
        className="stage"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <TopBar
          title={title}
          connection={ctrl.connection}
          streaming={ctrl.streaming}
          onOpenPeek={openPeek}
          onReconnect={ctrl.reconnect}
        />

        <ConnectionBanner
          status={ctrl.connection}
          onReconnect={ctrl.reconnect}
        />

        <main className="stage-main">
          <Transcript
            lines={activeSession.lines}
            typing={activeSession.typing}
            onButtonClick={ctrl.clickButton}
          />

          <Composer
            ref={composerRef}
            value={activeSession.input}
            disabled={!ctrl.connected}
            streaming={ctrl.streaming}
            recording={ctrl.recording}
            onChange={ctrl.setInput}
            onSubmit={ctrl.submit}
            onCancel={ctrl.cancel}
            onFile={ctrl.uploadFile}
            onToggleRecord={ctrl.toggleRecord}
          />
        </main>

        {dropOver ? <DropOverlay /> : null}
      </section>

      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        onCreateChat={ctrl.createChat}
        onRunCommand={ctrl.sendCommand}
        onSelectChat={ctrl.setActiveChat}
        sessions={ctrl.sessions.map((s) => ({
          chatId: s.chatId,
          label: s.label || displayChatId(s.chatId),
        }))}
      />

      <SessionPeek
        open={peekOpen}
        onClose={closePeek}
        session={activeSession}
        connection={ctrl.connection}
        userId={ctrl.userId}
      />
    </div>
  );
}
