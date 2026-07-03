import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import {
  IconClose,
  IconCopy,
  IconDownload,
  IconInfo,
  IconReply,
  IconRetry,
  IconTrash,
} from "../shell/icons";
import {
  canRetryLine,
  downloadableUrlForLine,
  isInspectableLine,
  lineInspectText,
  transcriptLinePreview,
  type MessageActionId,
  type MessageActionTarget,
} from "./messageActions";

interface MessageActionSheetProps {
  target: MessageActionTarget | null;
  onClose: () => void;
  onAction: (action: MessageActionId, target: MessageActionTarget) => void;
}

interface ActionItem {
  id: MessageActionId;
  label: string;
  tone?: "danger";
  icon: ComponentType<{ size?: number }>;
}

export function MessageActionSheet({
  target,
  onClose,
  onAction,
}: MessageActionSheetProps) {
  const [inspectOpen, setInspectOpen] = useState(false);

  useEffect(() => {
    setInspectOpen(false);
  }, [target?.line.id]);

  useEffect(() => {
    if (!target) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, target]);

  const actions = useMemo<ActionItem[]>(() => {
    if (!target) return [];
    const line = target.line;
    const items: ActionItem[] = [
      { id: "copy", label: "Copy", icon: IconCopy },
      { id: "reply", label: "Reply", icon: IconReply },
    ];
    if (canRetryLine(line)) {
      items.push({ id: "retry", label: "Retry", icon: IconRetry });
    }
    if (downloadableUrlForLine(line)) {
      items.push({ id: "download", label: "Download", icon: IconDownload });
    }
    if (isInspectableLine(line)) {
      items.push({ id: "inspect", label: "Inspect", icon: IconInfo });
    }
    items.push({ id: "delete", label: "Delete local", tone: "danger", icon: IconTrash });
    return items;
  }, [target]);

  if (!target) return null;

  const style: CSSProperties =
    target.x != null && target.y != null
      ? {
          left:
            typeof window === "undefined"
              ? target.x
              : Math.max(8, Math.min(target.x, window.innerWidth - 252)),
          top:
            typeof window === "undefined"
              ? target.y
              : Math.max(8, Math.min(target.y, window.innerHeight - 420)),
        }
      : {};

  const preview = transcriptLinePreview(target.line);

  const runAction = (action: MessageActionId) => {
    if (action === "inspect") {
      setInspectOpen((open) => !open);
      return;
    }
    onAction(action, target);
  };

  return (
    <div className="message-actions-layer" role="presentation">
      <button
        type="button"
        className="message-actions-backdrop"
        aria-label="Close message actions"
        onClick={onClose}
      />
      <section
        className="message-actions-menu motion-scale-in"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label="Message actions"
      >
        <div className="message-actions-grabber" aria-hidden />
        <header className="message-actions-head">
          <div className="message-actions-preview truncate">{preview}</div>
          <button
            type="button"
            className="message-actions-close"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose size={14} />
          </button>
        </header>
        <div className="message-actions-list">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                className={`message-action-item${
                  action.tone === "danger" ? " message-action-item-danger" : ""
                }`}
                onClick={() => runAction(action.id)}
              >
                <Icon size={16} />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
        {inspectOpen ? (
          <pre className="message-actions-inspect t-mono-sm">
            {lineInspectText(target.line)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
