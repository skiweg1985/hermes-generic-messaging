import { describe, expect, it } from "vitest";
import { deriveViewport } from "./useKeyboardInset";
import type { ViewportMetrics } from "./useVisualViewport";

function metrics(overrides: Partial<ViewportMetrics> = {}): ViewportMetrics {
  return {
    innerHeight: 800,
    visualHeight: 800,
    offsetTop: 0,
    isMobileDock: false,
    isAppleTouchDevice: false,
    editableFocused: false,
    ...overrides,
  };
}

describe("deriveViewport", () => {
  it("cuts the shell to the visual viewport height on mobile", () => {
    const { vars } = deriveViewport(
      metrics({ isMobileDock: true, innerHeight: 800, visualHeight: 500, editableFocused: true }),
    );
    expect(vars["--app-viewport-height"]).toBe("500px");
  });

  it("follows visualViewport offsetTop on mobile only while the keyboard is open or opening", () => {
    const { vars } = deriveViewport(
      metrics({ isMobileDock: true, offsetTop: 47, visualHeight: 500, editableFocused: true }),
    );
    expect(vars["--app-viewport-offset-top"]).toBe("47px");
    expect(vars["--app-visual-viewport-offset-top"]).toBe("47px");
    expect(vars["--app-keyboard-inset"]).toBe("0px");
  });

  it("ignores transient visualViewport offsetTop on mobile when no field is focused", () => {
    const { vars } = deriveViewport(
      metrics({ isMobileDock: true, offsetTop: 47, visualHeight: 800, editableFocused: false }),
    );
    expect(vars["--app-viewport-offset-top"]).toBe("0px");
    expect(vars["--app-visual-viewport-offset-top"]).toBe("47px");
  });

  it("keeps offset-top at 0 on desktop", () => {
    const { vars } = deriveViewport(metrics({ isMobileDock: false, offsetTop: 47 }));
    expect(vars["--app-viewport-offset-top"]).toBe("0px");
  });

  it("applies a low mobile height floor for landscape + keyboard", () => {
    const { vars } = deriveViewport(
      metrics({ isMobileDock: true, innerHeight: 400, visualHeight: 90, editableFocused: true }),
    );
    expect(vars["--app-viewport-height"]).toBe("140px");
  });

  it("keeps the desktop height floor at 320", () => {
    const { vars } = deriveViewport(metrics({ isMobileDock: false, visualHeight: 100 }));
    expect(vars["--app-viewport-height"]).toBe("320px");
  });

  it("resets scroll only when no input is focused on mobile", () => {
    expect(deriveViewport(metrics({ isMobileDock: true, editableFocused: true })).resetScroll).toBe(
      false,
    );
    expect(deriveViewport(metrics({ isMobileDock: true, editableFocused: false })).resetScroll).toBe(
      true,
    );
    expect(deriveViewport(metrics({ isMobileDock: false, editableFocused: true })).resetScroll).toBe(
      true,
    );
  });

  it("reports keyboardOpen when the visual viewport shrinks with focus on mobile", () => {
    expect(
      deriveViewport(
        metrics({ isMobileDock: true, innerHeight: 800, visualHeight: 500, editableFocused: true }),
      ).keyboardOpen,
    ).toBe(true);
    // Small deltas (address bar collapse etc.) are not treated as a keyboard.
    expect(
      deriveViewport(
        metrics({ isMobileDock: true, innerHeight: 800, visualHeight: 760, editableFocused: true }),
      ).keyboardOpen,
    ).toBe(false);
    // Not focused -> not a keyboard.
    expect(
      deriveViewport(
        metrics({ isMobileDock: true, innerHeight: 800, visualHeight: 500, editableFocused: false }),
      ).keyboardOpen,
    ).toBe(false);
  });

  it("exposes visual viewport bottom for consumers", () => {
    const { vars } = deriveViewport(
      metrics({ isMobileDock: true, offsetTop: 47, visualHeight: 500, editableFocused: true }),
    );
    expect(vars["--app-visual-viewport-bottom"]).toBe("547px");
  });
});
