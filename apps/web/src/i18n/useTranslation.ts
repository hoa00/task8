import { useTranslation as useI18nextTranslation } from 'react-i18next';
import type { UiTranslator } from '@studio/ui';

export function useTranslation(): { t: UiTranslator; language: string } {
  const { t, i18n } = useI18nextTranslation();
  return { t: (message, values) => t(message, values ?? {}), language: i18n.resolvedLanguage ?? 'vi' };
}
