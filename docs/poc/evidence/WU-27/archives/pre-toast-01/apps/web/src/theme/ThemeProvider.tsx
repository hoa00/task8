import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './theme-context';
import { applyRootPreferences, readThemePreferences, themePreferenceKey } from './preferences';
import type { ThemePreferences } from './preferences';
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
function subscribeDark(callback: () => void) {
  darkMedia.addEventListener('change', callback);
  return () => darkMedia.removeEventListener('change', callback);
}
export interface ThemeProviderProps { children: ReactNode }
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preferences, setValue] = useState(readThemePreferences);
  const systemDark = useSyncExternalStore(subscribeDark, () => darkMedia.matches);
  const setPreferences = useCallback((patch: Partial<ThemePreferences>) => {
    setValue(previous => {
      const next = { theme: patch.theme ?? previous.theme, accent: patch.accent ?? previous.accent, side: patch.side ?? previous.side, density: patch.density ?? previous.density, motion: patch.motion ?? previous.motion };
      return Object.keys(next).every(key => next[key as keyof ThemePreferences] === previous[key as keyof ThemePreferences]) ? previous : next;
    });
  }, []);
  useLayoutEffect(() => {
    applyRootPreferences(preferences);
    try { localStorage.setItem(themePreferenceKey, JSON.stringify(preferences)); } catch { /* UI preference still applies when storage is unavailable. */ }
  }, [preferences]);
  const value = useMemo(() => ({ preferences, setPreferences, effectiveDark: preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark) }), [preferences, setPreferences, systemDark]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
