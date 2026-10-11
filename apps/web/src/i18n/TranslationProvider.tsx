import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { UiTranslationContext } from '@studio/ui';
import { i18n } from './i18n';
import { useTranslation } from './useTranslation';

function UiTranslationBridge({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <UiTranslationContext value={t}>{children}</UiTranslationContext>;
}
export function TranslationProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}><UiTranslationBridge>{children}</UiTranslationBridge></I18nextProvider>;
}
