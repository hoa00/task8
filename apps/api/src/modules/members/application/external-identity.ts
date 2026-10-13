import { EntityIdSchema, type EntityId, type UserProfileDto } from '@studio/contracts/api';
import { z } from 'zod';
import type { RequestRepository } from '../../../db/client.ts';
import type { Clock } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import {
  bootstrapProfile,
  externalProfile,
  type ExternalProfile,
} from '../domain/bootstrap-profile.ts';
import { profileDto } from '../mapper.ts';
import { ensureIdentityProfile, linkIdentity } from '../persistence/external-identity.ts';

export type { ExternalProfile } from '../domain/bootstrap-profile.ts';
export interface ExternalIdentityProfile {
  identityId: EntityId;
  user: UserProfileDto;
}
export interface IdentityDependencies {
  clock: Clock;
  generateId: IdGenerator;
}
export async function ensureExternalProfile(
  repository: RequestRepository,
  input: ExternalProfile,
  dependencies: IdentityDependencies,
): Promise<ExternalIdentityProfile> {
  const profile = externalProfile(input);
  const candidate = bootstrapProfile(profile, dependencies.generateId());
  const row = await ensureIdentityProfile(
    repository,
    profile,
    candidate,
    dependencies.generateId(),
    dependencies.generateId(),
    dependencies.clock.now(),
  );
  // Root INSERT0 can mean a concurrent canonical winner. Do not use matchedBatch.
  if (!row) throw new ApiFailure('CONFLICT', 'Existing profile requires explicit identity linking');
  return { identityId: EntityIdSchema.parse(row.identityId), user: profileDto(row) };
}
const LinkInputSchema = z.strictObject({
  providerKey: z.literal('ict24h-identity'),
  tenant: z
    .string()
    .min(1)
    .max(240)
    .refine((value) => value.trim() === value && !/[\r\n]/u.test(value)),
  subject: z.uuid(),
  userId: EntityIdSchema,
});
export type LinkIdentityInput = z.infer<typeof LinkInputSchema>;
export async function explicitlyLinkIdentity(
  repository: RequestRepository,
  input: LinkIdentityInput,
  dependencies: IdentityDependencies,
) {
  const parsed = LinkInputSchema.safeParse(input);
  if (!parsed.success) throw new ApiFailure('VALIDATION_ERROR', 'Invalid identity link');
  const row = await linkIdentity(
    repository,
    parsed.data,
    parsed.data.userId,
    dependencies.generateId(),
    dependencies.clock.now(),
  );
  if (!row || row.userId !== parsed.data.userId)
    throw new ApiFailure('CONFLICT', 'Identity link conflicts with existing data');
  return { identityId: EntityIdSchema.parse(row.id), userId: parsed.data.userId };
}
