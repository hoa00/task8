import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql } from '../../projects/access.ts';
export function teamWorkload(repository: RequestRepository, scope: WorkspaceContext, id: string) {
  return repository.all<{ memberId: string; open: number; completed: number }>(
    `WITH counts AS (SELECT t.assigneeId,coalesce(sum(t.status!='done'),0) open,coalesce(sum(t.status='done'),0) completed FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} GROUP BY t.assigneeId) SELECT m.id memberId,coalesce(c.open,0) open,coalesce(c.completed,0) completed FROM workspaceMembers m LEFT JOIN counts c ON c.assigneeId=m.id WHERE m.workspaceId=? AND m.teamId=? AND m.removedAt IS NULL ORDER BY m.id`,
    [scope.workspaceId, scope.memberId, scope.workspaceId, id],
  );
}
export function teamProjectIds(repository: RequestRepository, scope: WorkspaceContext, id: string) {
  return repository.all<{ id: string }>(
    `SELECT p.id FROM projects p WHERE p.workspaceId=? AND p.teamId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} ORDER BY p.id`,
    [scope.workspaceId, id, scope.memberId],
  );
}
