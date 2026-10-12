import { memberDto, profileDto } from '../mapper.ts';
import { membershipIdentity, principalIdentity } from '../persistence/identity.ts';

import type { EntityId, UserProfileDto } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
export interface AuthenticatedPrincipal {
  user: UserProfileDto;
  currentWorkspaceId: EntityId;
}
export async function principal(
  repository: RequestRepository,
  userId: EntityId,
  currentWorkspaceId: EntityId,
): Promise<AuthenticatedPrincipal> {
  const [identity] = await principalIdentity(repository, userId, currentWorkspaceId);
  if (!identity) throw new ApiFailure('UNAUTHENTICATED', 'Valid local principal required');
  const u = identity.user;
  return {
    user: profileDto(u),
    currentWorkspaceId,
  };
}
export async function membership(
  repository: RequestRepository,
  workspaceId: EntityId,
  userId: EntityId,
) {
  const [row] = await membershipIdentity(repository, workspaceId, userId);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Workspace not found');
  const m = row.member,
    u = row.user;
  return memberDto({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    name: u.name,
    email: u.displayEmail,
    title: u.title,
    avatarColor: u.avatarColor,
    timezone: u.timezone,
    role: m.role,
    status: m.status,
    teamId: m.teamId,
    lastSeenAt: m.lastSeenAt,
    version: m.version,
  });
}
