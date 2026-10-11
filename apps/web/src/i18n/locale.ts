export const supportedLanguages = ['vi', 'en'] as const;
export type Language = typeof supportedLanguages[number];
export const defaultLanguage: Language = 'vi';
export const languagePreferenceKey = 'task8.ui.language.v1';
export function normalizeLanguage(value: unknown): Language {
  return value === 'en' || value === 'English (US)' || value === 'English (UK)' ? 'en' : defaultLanguage;
}
export function readLanguage(): Language {
  try { return normalizeLanguage(localStorage.getItem(languagePreferenceKey)); } catch { return defaultLanguage; }
}
