import type { DateOnly } from '@studio/contracts/api';
import { dateDistance } from '@studio/domain';
import type { MemberPreferencesDto } from '@studio/contracts/api';
export function formatAbsoluteDate(value: string, format: MemberPreferencesDto['dateFmt'] = (typeof document === 'undefined' ? 'MMM d' : document.documentElement.dataset.dateFormat ?? 'MMM d') as MemberPreferencesDto['dateFmt'], long = false): string {
 const date = new Date(`${value.slice(0,10)}T00:00:00Z`), year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
 if (format === 'd/M') return `${day}/${month}${long ? `/${year}` : ''}`;
 if (format === 'M/d') return `${month}/${day}${long ? `/${year}` : ''}`;
 if (format === 'yyyy-MM-dd') return value.slice(0,10);
 return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', ...(long || year !== new Date().getUTCFullYear() ? { year:'numeric' } : {}), timeZone:'UTC' }).format(date);
}
export function formatTaskDate(value: DateOnly, today: DateOnly): string {
 const offset = dateDistance(value, today);
 if (offset === 0) return 'Today'; if (offset === 1) return 'Tomorrow'; if (offset === -1) return 'Yesterday';
 const date = new Date(`${value}T00:00:00Z`);
 return offset > 1 && offset < 7 ? new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date) : formatAbsoluteDate(value);
}
export function ago(instant: string, now: string): string { const minutes = Math.round((Date.parse(now) - Date.parse(instant)) / 60000); if (minutes < 1) return 'just now'; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.round(hours / 24); if (days < 7) return `${days}d ago`; return formatAbsoluteDate(new Date(instant).toISOString().slice(0,10)); }
