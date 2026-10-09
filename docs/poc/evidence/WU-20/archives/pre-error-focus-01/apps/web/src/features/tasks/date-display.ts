import type { DateOnly } from '@studio/contracts/api';
import { dateDistance } from '@studio/domain';
export function formatTaskDate(value: DateOnly, today: DateOnly): string {
 const offset = dateDistance(value, today);
 if (offset === 0) return 'Today'; if (offset === 1) return 'Tomorrow'; if (offset === -1) return 'Yesterday';
 const date = new Date(`${value}T00:00:00Z`);
 return new Intl.DateTimeFormat('en-US', offset > 1 && offset < 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}
export function ago(instant: string, now: string): string { const minutes = Math.round((Date.parse(now) - Date.parse(instant)) / 60000); if (minutes < 1) return 'just now'; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.round(hours / 24); if (days < 7) return `${days}d ago`; return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(instant)); }
