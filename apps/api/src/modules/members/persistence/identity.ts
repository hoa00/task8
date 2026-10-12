import type { EntityId, UserProfileDto } from '@studio/contracts/api';
import { MemberSchema, UserProfileSchema } from '@studio/contracts/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestRepository } from '../../../db/client.ts';
import { users, workspaceMembers } from '../../../db/schema.ts';
import { nullableInstant } from '../../../shared/clock.ts';
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
  const [identity] = await repository.read((db) =>
    db
      .select({ user: users })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .where(
        and(
          eq(users.id, userId),
          eq(workspaceMembers.workspaceId, currentWorkspaceId),
          eq(workspaceMembers.status, 'active'),
          isNull(workspaceMembers.removedAt),
        ),
      )
      .limit(1),
  );
  if (!identity) throw new ApiFailure('UNAUTHENTICATED', 'Valid local principal required');
  const u = identity.user;
  return {
    user: UserProfileSchema.parse({
      id: u.id,
      name: u.name,
      email: u.displayEmail,
      title: u.title,
      avatarColor: u.avatarColor,
      timezone: u.timezone,
      version: u.version,
    }),
    currentWorkspaceId,
  };
}
export async function membership(
  repository: RequestRepository,
  workspaceId: EntityId,
  userId: EntityId,
) {
  const [row] = await repository.read((db) =>
    db
      .select({ member: workspaceMembers, user: users })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, 'active'),
          isNull(workspaceMembers.removedAt),
        ),
      )
      .limit(1),
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Workspace not found');
  const m = row.member,
    u = row.user;
  return MemberSchema.parse({
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
    lastSeenAt: nullableInstant(m.lastSeenAt),
    version: m.version,
  });
}
