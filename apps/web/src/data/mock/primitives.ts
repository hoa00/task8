import type { ApiError } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import { StudioApiError } from '../errors.ts';

export const fail = (code: ApiError['error']['code'], message: string, field?: string): never => {
  throw new StudioApiError({
    error: { code, message, ...(field ? { fieldErrors: { [field]: [message] } } : {}) },
  });
};

export function newMockId(clock: Clock) {
  const time = Date.parse(clock.now()).toString(16).padStart(12, '0');
  const random = crypto.randomUUID();
  return EntityIdSchema.parse(
    `${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`,
  );
}

export async function fingerprint(query: object): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(query));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
