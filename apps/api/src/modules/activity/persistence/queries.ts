import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { activity } from '../../../db/schema.ts';
import { readAccessSql as accessSql } from '../../projects/access.ts';

export function listActivityReadActivity(
  r: RequestRepository,
  query: {
    limit: number;
    cursor?: string | undefined;
    projectId?: (string & z.core.$brand<'EntityId'>) | undefined;
    taskId?: (string & z.core.$brand<'EntityId'>) | undefined;
    actorId?: (string & z.core.$brand<'EntityId'>) | undefined;
  },
  s: WorkspaceContext,
) {
  return r.all<typeof activity.$inferSelect>(
    `SELECT a.* FROM activity a
    LEFT JOIN tasks t ON t.workspaceId=a.workspaceId AND t.id=a.taskId
    LEFT JOIN projects p ON p.workspaceId=a.workspaceId AND p.id=coalesce(t.projectId,a.projectId)
    WHERE a.workspaceId=? AND a.revertedAt IS NULL
    AND (a.actorId IS NULL OR EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=a.workspaceId AND m.id=a.actorId AND m.removedAt IS NULL))
    AND (a.taskId IS NULL OR (t.id IS NOT NULL AND t.deletedAt IS NULL AND (a.projectId IS NULL OR a.projectId=t.projectId)))
    AND (coalesce(t.projectId,a.projectId) IS NULL OR (p.id IS NOT NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}))
    ${query.projectId ? 'AND coalesce(t.projectId,a.projectId)=?' : ''} ${query.taskId ? 'AND a.taskId=?' : ''} ${query.actorId ? 'AND a.actorId=?' : ''}
    ORDER BY a.createdAt DESC,a.id DESC`,
    [
      s.workspaceId,
      s.memberId,
      ...(query.projectId ? [query.projectId] : []),
      ...(query.taskId ? [query.taskId] : []),
      ...(query.actorId ? [query.actorId] : []),
    ],
  );
}
