export function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status" aria-label="Assistant is typing">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}
