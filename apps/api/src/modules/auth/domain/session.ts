import { EntityIdSchema } from '@studio/contracts/api';
import { z } from 'zod';
import { ApiFailure } from '../../../shared/errors.ts';
const instant = z.number().int().nonnegative().safe();
export const SessionRecordSchema = z.object({
  id: EntityIdSchema,
  sidHash: z.string().regex(/^[a-f0-9]{64}$/u),
  identityId: EntityIdSchema,
  userId: EntityIdSchema,
  accessCiphertext: z.string().min(1).nullable(),
  refreshCiphertext: z.string().min(1).nullable(),
  accessExpiresAt: instant,
  refreshExpiresAt: instant,
  expiresAt: instant,
  tokenVersion: z.number().int().positive().safe(),
  authGeneration: z.number().int().positive().safe(),
  createdAt: instant,
  revokedAt: instant.nullable(),
  subject: z.uuid(),
  tenant: z.string().min(1),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export function sessionRecord(input: unknown): SessionRecord {
  const parsed = SessionRecordSchema.safeParse(input);
  if (!parsed.success)
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Session storage is unavailable');
  return parsed.data;
}
export function requireSession(
  record: SessionRecord | undefined,
  now: number,
  refresh = false,
): SessionRecord {
  if (
    !record ||
    record.revokedAt !== null ||
    record.expiresAt <= now ||
    (refresh ? record.refreshExpiresAt : record.accessExpiresAt) <= now
  )
    throw new ApiFailure('UNAUTHENTICATED', 'Authentication required');
  return record;
}
export function requireExpectedSession(
  record: SessionRecord | undefined,
  expectedId: string | undefined,
): void {
  if (expectedId !== undefined && record?.id !== expectedId)
    throw new ApiFailure('SESSION_CHANGED', 'The browser session has changed');
}
