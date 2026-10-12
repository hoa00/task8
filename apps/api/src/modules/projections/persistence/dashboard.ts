import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql } from '../../projects/access.ts';
import { required } from '../../../shared/errors.ts';
export function homeTaskCounters(
  repository: RequestRepository,
  scope: WorkspaceContext,
  now: number,
  date: string,
) {
  return repository
    .all<{
      totalTasks: number;
      completedThisWeek: number;
      overdue: number;
    }>(
      `SELECT count(*) totalTasks,coalesce(sum(t.status='done' AND t.completedAt IS NOT NULL AND ?-t.completedAt<604800000),0) completedThisWeek,coalesce(sum(t.status!='done' AND t.dueDate IS NOT NULL AND t.dueDate<?),0) overdue FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql}`,
      [now, date, scope.workspaceId, scope.memberId],
    )
    .then((rows) => required(rows[0], 'Missing home task counters'));
}
export function overviewWorkload(repository: RequestRepository, scope: WorkspaceContext) {
  return repository.all<{ id: string; name: string; avatarColor: string; openTasks: number }>(
    `WITH counts AS (SELECT t.assigneeId,count(*) total FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.status!='done' AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} GROUP BY t.assigneeId) SELECT m.id,u.name,u.avatarColor,coalesce(c.total,0) openTasks FROM workspaceMembers m JOIN users u ON u.id=m.userId LEFT JOIN counts c ON c.assigneeId=m.id WHERE m.workspaceId=? AND m.removedAt IS NULL AND m.status='active' ORDER BY openTasks DESC,m.id ASC`,
    [scope.workspaceId, scope.memberId, scope.workspaceId],
  );
}
