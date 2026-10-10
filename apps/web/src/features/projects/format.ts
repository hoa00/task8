import { formatAbsoluteDate } from '../tasks/date-display';

export function projectDate(date: string | null, year = false, today?: string) { return date ? formatAbsoluteDate(date, undefined, year, today) : '—'; }
