import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { fitBatch, markerSql, matchedBatch, patchSql } from '../../../db/commands.ts';
import type { users } from '../../../db/schema.ts';

export function updateProfileFields(
  patch: {
    name?: string | undefined;
    title?: string | undefined;
    avatarColor?: string | undefined;
  },
  now: number,
  marker: EntityId,
) {
  return patchSql({ ...patch, updatedAt: now, lastMutationId: marker });
}
export function updateProfileBudget(r: RequestRepository) {
  return fitBatch(r, 2, 1);
}
export function updateProfileCommitUsers(
  r: RequestRepository,
  fields: { sql: string; parameters: (string | number | null)[] },
  userId: EntityId,
  expectedVersion: number,
  workspaceId: EntityId,
  now: number,
  marker: EntityId,
) {
  return matchedBatch(r, [
    r.prepare(
      `UPDATE users SET ${fields.sql},version=version+1 WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.userId=users.id AND m.workspaceId=? AND m.status='active' AND m.removedAt IS NULL)`,
      [...fields.parameters, userId, expectedVersion, workspaceId],
    ),
    r.prepare(
      `UPDATE workspaceMembers SET version=version+1,updatedAt=?,lastMutationId=? WHERE userId=? AND ${markerSql('users')}`,
      [now, marker, userId, userId, marker],
    ),
  ]);
}
export function updateProfileReadUsers(r: RequestRepository, userId: EntityId) {
  return r.all<typeof users.$inferSelect>('SELECT * FROM users WHERE id=?', [userId]);
}
