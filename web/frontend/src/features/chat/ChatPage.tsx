import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { Rail } from "../shell/Rail";
import { TopBar } from "../shell/TopBar";
import { CommandPalette } from "../shell/CommandPalette";
import { SessionPeek } from "../shell/SessionPeek";
import { ConnectionBanner } from "../shell/ConnectionBanner";
import { Composer, type ComposerHandle } from "../composer/Composer";
import { DropOverlay } from "../composer/DropOverlay";
import { Transcript } from "./Transcript";
import { useChatController } from "./useChatController";
import { chatDisplayTitle } from "./chatReducer";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { IconMenu } from "../shell/icons";
import "../shell/shell.css";
import "../composer/composer.css";
import "../media/media.css";
import "../../styles/premium.css";

export function ChatPage() {
  const ctrl = useChatController();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const dragCounter = useRef(0);
  const composerRef = useRef<ComposerHandle>(null);
  const stageMainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    const timers: number[] = [];

    const isAppleTouchDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const hasEditableFocus = () => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      return tag === "textarea" || tag === "input" || active.hasAttribute("contenteditable");
    };

    const resetWindowScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const updateViewportHeight = () => {
      const viewport = window.visualViewport;
      const currentHeight = window.innerHeight;
      const visualHeight = viewport?.height ?? currentHeight;
      const visualOffsetTop = viewport?.offsetTop ?? window.scrollY ?? 0;
      const keyboardFocused = isAppleTouchDevice && hasEditableFocus();
      const height = keyboardFocused ? visualHeight : Math.min(currentHeight, visualHeight);

      document.documentElement.style.setProperty(
        "--app-viewport-height",
        `${Math.max(320, Math.round(height))}px`,
      );
      document.documentElement.style.setProperty(
        "--app-viewport-offset-top",
        `${keyboardFocused ? Math.round(visualOffsetTop) : 0}px`,
      );
      document.documentElement.style.setProperty("--app-keyboard-inset", "0px");
      resetWindowScroll();
    };

    const scheduleViewportUpdate = () => {
      cancelAnimationFrame(frame);
      while (timers.length > 0) {
        const timer = timers.pop();
        if (timer != null) window.clearTimeout(timer);
      }
      frame = requestAnimationFrame(updateViewportHeight);
      timers.push(window.setTimeout(updateViewportHeight, 80));
      timers.push(window.setTimeout(updateViewportHeight, 260));
      timers.push(window.setTimeout(updateViewportHeight, 520));
    };

    const virtualKeyboard = navigator.virtualKeyboard;

    scheduleViewportUpdate();
    window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    virtualKeyboard?.addEventListener("geometrychange", scheduleViewportUpdate);
    window.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    window.addEventListener("resize", scheduleViewportUpdate);
    window.addEventListener("orientationchange", scheduleViewportUpdate);
    window.addEventListener("focusin", scheduleViewportUpdate);
    window.addEventListener("focusout", scheduleViewportUpdate);

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.visualViewport?.removeEventListener("resize", scheduleViewportUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleViewportUpdate);
      virtualKeyboard?.removeEventListener("geometrychange", scheduleViewportUpdate);
      window.removeEventListener("scroll", scheduleViewportUpdate);
      window.removeEventListener("resize", scheduleViewportUpdate);
      window.removeEventListener("orientationchange", scheduleViewportUpdate);
      window.removeEventListener("focusin", scheduleViewportUpdate);
      window.removeEventListener("focusout", scheduleViewportUpdate);
      document.documentElement.style.removeProperty("--app-viewport-height");
      document.documentElement.style.removeProperty("--app-viewport-offset-top");
      document.documentElement.style.removeProperty("--app-keyboard-inset");
    };
  }, []);

  useLayoutEffect(() => {
    const root = stageMainRef.current;
    if (!root) return;

    let frame = 0;
    const updateComposerClearance = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const composer = root.querySelector<HTMLElement>(".composer-region");
        const height = composer?.getBoundingClientRect().height ?? 0;
        root.style.setProperty("--composer-clearance", `${Math.ceil(height)}px`);
      });
    };

    updateComposerClearance();
    const composer = root.querySelector<HTMLElement>(".composer-region");
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateComposerClearance) : null;
    if (composer) observer?.observe(composer);
    window.addEventListener("resize", updateComposerClearance);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateComposerClearance);
    };
  }, []);

  const openPalette = useCallback(() => {
    setRailOpen(false);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openPeek = useCallback(() => setPeekOpen(true), []);
  const closePeek = useCallback(() => setPeekOpen(false), []);
  const toggleRail = useCallback(() => setRailOpen((v) => !v), []);
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
    <div className="shell-root">
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

      {!railOpen ? (
        <button
          type="button"
          className="rail-edge-toggle"
          onClick={toggleRail}
          aria-label="Open navigation"
          aria-expanded={railOpen}
          title="Open navigation"
        >
          <IconMenu size={20} />
        </button>
      ) : null}

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

        <main ref={stageMainRef} className="stage-main">
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
        userId={ctrl.userId}
      />
    </div>
  );
}
