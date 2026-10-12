import type { ActivityQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { activity } from '../../../db/schema.ts';
import { historySeek } from '../../../db/history-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { required } from '../../../shared/errors.ts';
import { readAccessSql } from '../../projects/access.ts';
export async function pagedActivity(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof ActivityQuerySchema>,
  cursor: CursorPayload | null,
): Promise<{ rows: (typeof activity.$inferSelect)[]; total: number }> {
  const from =
    'activity a LEFT JOIN tasks t ON t.workspaceId=a.workspaceId AND t.id=a.taskId LEFT JOIN projects p ON p.workspaceId=a.workspaceId AND p.id=coalesce(t.projectId,a.projectId)';
  const where = [
    `a.workspaceId=?`,
    `a.revertedAt IS NULL`,
    `(a.actorId IS NULL OR EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=a.workspaceId AND m.id=a.actorId AND m.removedAt IS NULL))`,
    `(a.taskId IS NULL OR (t.id IS NOT NULL AND t.deletedAt IS NULL AND (a.projectId IS NULL OR a.projectId=t.projectId)))`,
    `(coalesce(t.projectId,a.projectId) IS NULL OR (p.id IS NOT NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${readAccessSql}))`,
  ];
  const parameters = [scope.workspaceId, scope.memberId];
  if (query.projectId) {
    where.push('coalesce(t.projectId,a.projectId)=?');
    parameters.push(query.projectId);
  }
  if (query.taskId) {
    where.push('a.taskId=?');
    parameters.push(query.taskId);
  }
  if (query.actorId) {
    where.push('a.actorId=?');
    parameters.push(query.actorId);
  }
  const predicate = where.map((sql) => `(${sql})`).join(' AND ');
  const total = required(
    (
      await repository.all<{ total: number }>(
        `SELECT count(*) total FROM ${from} WHERE ${predicate}`,
        parameters,
      )
    )[0],
    'Missing activity count',
  ).total;
  const seek = cursor
    ? historySeek('a.createdAt', 'a.id', cursor, 'desc')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<typeof activity.$inferSelect>(
    `SELECT a.* FROM ${from} WHERE ${predicate} AND ${seek.sql} ORDER BY a.createdAt DESC,a.id DESC LIMIT ?`,
    [...parameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, total };
}
