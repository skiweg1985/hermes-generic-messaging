/**
 * Theme preference model. "system" follows prefers-color-scheme; "light" and
 * "dark" pin the theme. JS always resolves the preference to a concrete
 * data-theme attribute on <html> so the stylesheets only need
 * [data-theme="light"] selectors (see index.html for the pre-paint bootstrap
 * script, which must mirror this logic).
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "hermes.theme";

/** --surface-canvas per theme; keeps <meta name="theme-color"> in sync. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0a0a0c",
  light: "#f7f8fa",
};

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

export function loadThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage blocked — preference lives in memory for this session only.
  }
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme);
}
