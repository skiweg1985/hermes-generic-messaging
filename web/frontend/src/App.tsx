import { ChatPage } from "./features/chat/ChatPage";
import { ErrorBoundary } from "./features/shell/ErrorBoundary";

export function App() {
  return (
    <ErrorBoundary>
      <ChatPage />
    </ErrorBoundary>
  );
}
