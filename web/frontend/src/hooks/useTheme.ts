import { useCallback, useEffect, useState } from "react";
import {
  applyResolvedTheme,
  loadThemePreference,
  persistThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "../lib/theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

export interface ThemeStore {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Owns the theme preference (dark/light/system). Persists explicit choices to
 * localStorage and keeps the resolved theme applied to <html data-theme> and
 * the theme-color/color-scheme meta tags. In "system" mode it tracks
 * prefers-color-scheme changes live.
 */
export function useTheme(): ThemeStore {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadThemePreference);
  const [systemLight, setSystemLight] = useState<boolean>(
    () => window.matchMedia(LIGHT_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(LIGHT_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  const resolved = resolveTheme(preference, systemLight);

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    persistThemePreference(pref);
  }, []);

  return { preference, resolved, setPreference };
}
