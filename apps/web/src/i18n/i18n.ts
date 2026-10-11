import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json' with { type: 'json' };
import vi from './locales/vi.json' with { type: 'json' };
import { defaultLanguage, normalizeLanguage, readLanguage, supportedLanguages, languagePreferenceKey } from './locale.ts';

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, vi: { translation: vi } },
  lng: readLanguage(), fallbackLng: defaultLanguage, supportedLngs: [...supportedLanguages],
  keySeparator: false, nsSeparator: false, initAsync: false,
  interpolation: { escapeValue: false }, react: { useSuspense: false },
});
function applyLanguage(language: string) {
  const normalized = normalizeLanguage(language);
  if (typeof document !== 'undefined') document.documentElement.lang = normalized;
  try { localStorage.setItem(languagePreferenceKey, normalized); } catch { /* Preference still works without browser storage. */ }
}
i18n.on('languageChanged', applyLanguage);
applyLanguage(i18n.language);
export function setLanguage(value: unknown) { return i18n.changeLanguage(normalizeLanguage(value)); }
export function locale(): string { return i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN'; }
export function translate(message: string, values?: Record<string, string | number>): string { return i18n.t(message, values ?? {}); }
