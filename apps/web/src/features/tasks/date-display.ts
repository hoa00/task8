import type { DateOnly } from '@studio/contracts/api';
import { dateDistance } from '@studio/domain';
import type { MemberPreferencesDto } from '@studio/contracts/api';
import { locale, translate as t } from '../../i18n/i18n.ts';
export function formatAbsoluteDate(value: string, format: MemberPreferencesDto['dateFmt'] = (typeof document === 'undefined' ? 'MMM d' : document.documentElement.dataset.dateFormat ?? 'MMM d') as MemberPreferencesDto['dateFmt'], long = false, today?: string): string {
 const date = new Date(`${value.slice(0,10)}T00:00:00Z`), year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
 if (format === 'd/M') return `${day}/${month}${long ? `/${year}` : ''}`;
 if (format === 'M/d') return `${month}/${day}${long ? `/${year}` : ''}`;
 if (format === 'yyyy-MM-dd') return value.slice(0,10);
 return new Intl.DateTimeFormat(locale(), { month:'short', day:'numeric', ...(long || year !== (today ? Number(today.slice(0,4)) : new Date().getUTCFullYear()) ? { year:'numeric' } : {}), timeZone:'UTC' }).format(date);
}
export function formatTaskDate(value: DateOnly, today: DateOnly): string {
 const offset = dateDistance(value, today);
 if (offset === 0) return t('Today'); if (offset === 1) return t('Tomorrow'); if (offset === -1) return t('Yesterday');
 const date = new Date(`${value}T00:00:00Z`);
 return offset > 1 && offset < 7 ? new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(date) : formatAbsoluteDate(value, undefined, false, today);
}
export function ago(instant: string, now: string): string { const minutes = Math.round((Date.parse(now) - Date.parse(instant)) / 60000); if (minutes < 1) return t('just now'); if (minutes < 60) return t('{{count}}m ago', { count: minutes }); const hours = Math.round(minutes / 60); if (hours < 24) return t('{{count}}h ago', { count: hours }); const days = Math.round(hours / 24); if (days < 7) return t('{{count}}d ago', { count: days }); return formatAbsoluteDate(new Date(instant).toISOString().slice(0,10), undefined, false, now.slice(0,10)); }
