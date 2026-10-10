import { createContext, useContext } from 'react';
import type { ThemePreferences } from './preferences';
export interface ThemeContextValue {
  preferences: ThemePreferences;
  effectiveDark: boolean;
  setPreferences: (patch: Partial<ThemePreferences>) => void;
}
export const ThemeContext = createContext<ThemeContextValue | null>(null);
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme requires ThemeProvider');
  return value;
}
