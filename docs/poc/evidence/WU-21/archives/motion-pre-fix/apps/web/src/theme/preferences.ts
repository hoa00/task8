export interface ThemePreferences {
  theme: 'system' | 'light' | 'dark';
  accent: 'indigo' | 'blue' | 'violet' | 'teal' | 'rose' | 'graphite';
  side: 'comfortable' | 'compact';
  density: 'comfortable' | 'compact';
  motion: 'system' | 'full' | 'reduce';
}
export const themePreferenceKey = 'task8.ui.theme.v1';
export const defaultThemePreferences: ThemePreferences = {
  theme: 'system', accent: 'indigo', side: 'comfortable', density: 'comfortable', motion: 'system',
};
export function readThemePreferences(): ThemePreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(themePreferenceKey) ?? 'null');
    if (!stored || typeof stored !== 'object') return { ...defaultThemePreferences };
    const values = stored as Partial<ThemePreferences>;
    return {
      theme: ['system', 'light', 'dark'].includes(values.theme ?? '') ? values.theme! : 'system',
      accent: ['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite'].includes(values.accent ?? '') ? values.accent! : 'indigo',
      side: values.side === 'compact' ? 'compact' : 'comfortable',
      density: values.density === 'compact' ? 'compact' : 'comfortable',
      motion: ['system', 'full', 'reduce'].includes(values.motion ?? '') ? values.motion! : 'system',
    };
  } catch { return { ...defaultThemePreferences }; }
}
export function applyRootPreferences(preferences: ThemePreferences, root = document.documentElement): void {
  if (preferences.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preferences.theme);
  if (preferences.accent === 'indigo') root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', preferences.accent);
  root.setAttribute('data-side', preferences.side);
  root.setAttribute('data-density', preferences.density);
  if (preferences.motion === 'reduce') root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');
}
