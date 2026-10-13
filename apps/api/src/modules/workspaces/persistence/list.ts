import type { EntityId } from '@studio/contracts/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { RequestRepository } from '../../../db/client.ts';
import { workspaceMembers, workspaces } from '../../../db/schema.ts';
export function workspaceMemberships(r: RequestRepository, userId: EntityId) {
  return r.read((db) =>
    db
      .select({ workspace: workspaces })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, 'active'),
          isNull(workspaceMembers.removedAt),
        ),
      )
      .orderBy(asc(workspaces.id)),
  );
}
export function firstWorkspaceMembership(r: RequestRepository, userId: EntityId) {
  return r.all<{ id: string }>(
    `SELECT w.id FROM workspaces w JOIN workspaceMembers m ON m.workspaceId=w.id
    WHERE m.userId=? AND m.status='active' AND m.removedAt IS NULL ORDER BY w.id ASC LIMIT 1`,
    [userId],
  );
}
