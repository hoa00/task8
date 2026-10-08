import type { DateOnly } from '@studio/contracts/api';
import { dateDistance } from '@studio/domain';
export function formatTaskDate(value: DateOnly, today: DateOnly): string {
 const offset = dateDistance(value, today);
 if (offset === 0) return 'Today'; if (offset === 1) return 'Tomorrow'; if (offset === -1) return 'Yesterday';
 const date = new Date(`${value}T00:00:00Z`);
 return new Intl.DateTimeFormat('en-US', offset > 1 && offset < 7 ? { weekday: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}
