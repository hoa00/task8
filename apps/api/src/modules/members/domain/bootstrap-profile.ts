import { EntityIdSchema, UserProfileSchema, type EntityId } from '@studio/contracts/api';
import { z } from 'zod';
import { ApiFailure } from '../../../shared/errors.ts';
import { d1ReadText } from '../../../shared/text-key-encoder.ts';

const ExternalProfileSchema = z.strictObject({
  providerKey: z.literal('ict24h-identity'),
  tenant: z
    .string()
    .min(1)
    .max(240)
    .refine((value) => value.trim() === value && !/[\r\n]/u.test(value)),
  subject: z.uuid(),
  email: z.email().max(254),
  fullname: z.string().max(4096).nullable().optional(),
  username: z.string().max(4096).nullable().optional(),
});
export type ExternalProfile = z.infer<typeof ExternalProfileSchema>;
export function externalProfile(input: unknown): ExternalProfile {
  const result = ExternalProfileSchema.safeParse(input);
  if (!result.success) throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Invalid identity profile');
  return result.data;
}
function wellFormed(value: string): boolean {
  return d1ReadText(value) === value;
}
function boundedName(value: string): string {
  let result = '';
  for (const character of value.trim()) {
    if (result.length + character.length > 240) break;
    result += character;
  }
  return result;
}
export function bootstrapProfile(input: ExternalProfile, userId: EntityId) {
  const profile = externalProfile(input);
  const rawName = profile.fullname?.trim() || profile.username?.trim() || profile.email;
  if (![rawName, profile.email].every(wellFormed))
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Invalid identity profile');
  const candidate = {
    id: EntityIdSchema.parse(userId),
    name: boundedName(rawName),
    email: profile.email,
    title: '',
    avatarColor: '#6B7280',
    timezone: 'UTC',
    version: 1,
  };
  const result = UserProfileSchema.safeParse(candidate);
  const readEquivalent = UserProfileSchema.safeParse({
    ...candidate,
    name: d1ReadText(candidate.name),
    email: d1ReadText(candidate.email),
  });
  if (!result.success || !readEquivalent.success)
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Invalid identity profile');
  return result.data;
}
