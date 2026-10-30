import type { EntityId, UpdateProfileInput } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { CommandAuthority } from '../../../shared/scope.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { ProfileDtoInput } from '../mapper.ts';
import { profileDto } from '../mapper.ts';
import {
  updateProfileBudget,
  updateProfileCommitUsers,
  updateProfileFields,
  updateProfileReadUsers,
} from '../persistence/profile.ts';
export async function updateProfile(
  r: RequestRepository,
  userId: EntityId,
  workspaceId: EntityId,
  body: UpdateProfileInput,
  now: number,
  authority: CommandAuthority,
  generateId: IdGenerator = newId,
) {
  const { expectedVersion, ...patch } = body,
    marker = generateId(),
    fields = updateProfileFields(patch, now, marker);
  updateProfileBudget(r);
  await updateProfileCommitUsers(
    r,
    fields,
    userId,
    expectedVersion,
    workspaceId,
    now,
    marker,
    authority,
  );
  const [u] = await updateProfileReadUsers(r, userId);
  return profileDto(requireProfile(u));
}

function requireProfile(u: ProfileDtoInput | undefined): ProfileDtoInput {
  if (!u) throw new ApiFailure('INTERNAL_ERROR', 'Missing profile after update');
  return u;
}
