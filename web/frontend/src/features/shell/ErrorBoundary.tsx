import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level render guard. A throw anywhere in the tree (e.g. an unexpected
 * event shape reaching the chat reducer during render) is caught here and shown
 * as a recoverable panel instead of unmounting the whole root to a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for diagnostics; the UI stays usable via the reset/reload panel.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100dvh",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ margin: 0, opacity: 0.8 }}>
            The chat interface hit an unexpected error and stopped rendering.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={this.handleReset}>
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
