import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { Button, Icon } from '@studio/ui';
import { useDevScenario } from './dev-context';
export function DevOfflineBar() { useTranslation(); const dev = useDevScenario(); return dev.offline ? <div data-offline-preview className="flex items-center gap-[10px] border-0 border-b border-solid border-[color-mix(in_srgb,var(--amber)_25%,transparent)] bg-amber-soft px-4 py-2 text-sm text-amber" role="alert"><Icon name="wifi-off" size={15}/><span><b>{t("You're offline.")}</b>  {t("This preview does not queue or sync changes.")}</span><span className="flex-1"/><Button size="sm" loading={dev.retrying} onClick={dev.retryOnline}>{t("Try again")}</Button></div> : null; }
