import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Rail } from "../shell/Rail";
import { TopBar } from "../shell/TopBar";
import { CommandPalette } from "../shell/CommandPalette";
import { SessionPeek } from "../shell/SessionPeek";
import { ConnectionBanner } from "../shell/ConnectionBanner";
import { Composer, type ComposerHandle } from "../composer/Composer";
import { DropOverlay } from "../composer/DropOverlay";
import { Transcript } from "./Transcript";
import { ViewportDebugOverlay } from "./ViewportDebugOverlay";
import { useChatController } from "./useChatController";
import { chatDisplayTitle } from "./chatReducer";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import "../shell/shell.css";
import "../composer/composer.css";
import "../media/media.css";
import "../../styles/premium.css";

const DOCKED_RAIL_QUERY = "(min-width: 1081px)";
const SIDEBAR_COLLAPSED_KEY = "hermes.sidebarCollapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function ChatPage() {
  const ctrl = useChatController();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [dropOver, setDropOver] = useState(false);
  const dragCounter = useRef(0);
  const composerRef = useRef<ComposerHandle>(null);

  useKeyboardInset();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* storage unavailable — collapse state stays in-memory only */
    }
  }, [sidebarCollapsed]);

  const openPalette = useCallback(() => {
    setRailOpen(false);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openPeek = useCallback(() => setPeekOpen(true), []);
  const closePeek = useCallback(() => setPeekOpen(false), []);
  // On docked (wide) layouts the toggle collapses/expands the sidebar in place;
  // on narrower layouts it opens/closes the overlay drawer.
  const toggleRail = useCallback(() => {
    if (window.matchMedia(DOCKED_RAIL_QUERY).matches) {
      setSidebarCollapsed((v) => !v);
    } else {
      setRailOpen((v) => !v);
    }
  }, []);
  const closeRail = useCallback(() => setRailOpen(false), []);

  const handleSelectSession = useCallback(
    (chatId: string) => {
      ctrl.setActiveChat(chatId);
      setRailOpen(false);
    },
    [ctrl],
  );

  const handleCreateChat = useCallback(() => {
    ctrl.createChat();
    setRailOpen(false);
  }, [ctrl]);

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
  const title = chatDisplayTitle(activeSession);

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
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void ctrl.addFiles(Array.from(files));
    }
  };

  return (
    <div className={`shell-root${sidebarCollapsed ? " shell-rail-hidden" : ""}`}>
      <Rail
        userId={ctrl.userId}
        workspaceName="Generic Messaging"
        sessions={ctrl.sessions}
        activeChatId={ctrl.activeChatId}
        drawerOpen={railOpen}
        onSelectSession={handleSelectSession}
        onCreateChat={handleCreateChat}
        onOpenPalette={openPalette}
        onCloseDrawer={closeRail}
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
          onToggleRail={toggleRail}
        />

        <ConnectionBanner
          status={ctrl.connection}
          reconnecting={ctrl.reconnecting}
          onReconnect={ctrl.reconnect}
        />

        <main className="stage-main">
          <Transcript
            chatId={ctrl.activeChatId}
            lines={activeSession.lines}
            typing={activeSession.typing}
            onButtonClick={ctrl.clickButton}
            onReplyLine={(line) => {
              ctrl.replyToLine(line);
              requestAnimationFrame(() => composerRef.current?.focus());
            }}
            onRetryLine={ctrl.retryLine}
            onDeleteLine={ctrl.deleteLineLocal}
          />

          <Composer
            ref={composerRef}
            value={activeSession.input}
            disabled={!ctrl.connected}
            streaming={ctrl.streaming}
            typing={activeSession.typing}
            recording={ctrl.recording}
            recordingLevel={ctrl.recordingLevel}
            replyTarget={activeSession.replyTarget}
            pendingAttachments={activeSession.pendingAttachments}
            onChange={ctrl.setInput}
            onClearReply={ctrl.clearReply}
            onSubmit={ctrl.submit}
            onCancel={ctrl.cancel}
            onFiles={(files) => void ctrl.addFiles(files)}
            onRetryUpload={(id) => void ctrl.retryUpload(id)}
            onRemovePending={ctrl.removePending}
            onStartRecord={ctrl.startRecording}
            onStopRecord={ctrl.stopRecording}
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
          label: chatDisplayTitle(s),
        }))}
      />

      <SessionPeek
        open={peekOpen}
        onClose={closePeek}
        session={activeSession}
        connection={ctrl.connection}
        reconnecting={ctrl.reconnecting}
        link={ctrl.link}
        upstream={ctrl.upstream}
        upstreamLoading={ctrl.upstreamLoading}
        onReconnect={ctrl.reconnect}
        onRefreshDiagnostics={ctrl.refreshDiagnostics}
        userId={ctrl.userId}
      />

      {import.meta.env.DEV ? <ViewportDebugOverlay /> : null}
    </div>
  );
}
