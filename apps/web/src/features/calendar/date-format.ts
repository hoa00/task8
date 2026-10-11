import { DateOnlySchema } from '@studio/contracts/api';
import type { DateOnly, MemberPreferencesDto } from '@studio/contracts/api';
import { locale } from '../../i18n/i18n';
export const calendarWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export function calendarDateLabel(date: DateOnly, today: DateOnly, format: MemberPreferencesDto['dateFmt'], long = false): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  if (format === 'yyyy-MM-dd') return date;
  if (format === 'd/M' || format === 'M/d') return `${format === 'd/M' ? `${day}/${month}` : `${month}/${day}`}${long ? `/${year}` : ''}`;
  return new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', ...(long || date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function calendarDateParam(value: string | null): DateOnly | undefined { const parsed = DateOnlySchema.safeParse(value); return parsed.success ? parsed.data : undefined; }
