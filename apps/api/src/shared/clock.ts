export interface Clock {
  now(): number;
}
export const serverClock: Clock = { now: () => Date.now() };
export const instant = (value: number) => new Date(value).toISOString();
export const nullableInstant = (value: number | null) => (value === null ? null : instant(value));

export const epoch = (value: string | null) => (value === null ? null : Date.parse(value));
