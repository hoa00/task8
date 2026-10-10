import { DateOnlySchema, InstantSchema } from '@studio/contracts/api';
import type { DateOnly, Instant } from '@studio/contracts/api';

export interface Clock {
  now(): Instant;
  today(): DateOnly;
}

export function createFixedClock(value: string): Clock {
  const instant = InstantSchema.parse(value);
  const today = DateOnlySchema.parse(instant.slice(0, 10));
  return { now: () => instant, today: () => today };
}

// The POC workspace timezone is UTC; calendar dates never parse in local time.
export const systemClock: Clock = {
  now: () => InstantSchema.parse(new Date().toISOString()),
  today: () => DateOnlySchema.parse(new Date().toISOString().slice(0, 10)),
};
