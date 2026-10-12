import type { EntityId } from '@studio/contracts/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestRepository } from '../../../db/client.ts';
import { users, workspaceMembers } from '../../../db/schema.ts';
export function principalIdentity(
  repository: RequestRepository,
  userId: EntityId,
  currentWorkspaceId: EntityId,
) {
  return repository.read((db) =>
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
}
export function membershipIdentity(
  repository: RequestRepository,
  workspaceId: EntityId,
  userId: EntityId,
) {
  return repository.read((db) =>
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
}
