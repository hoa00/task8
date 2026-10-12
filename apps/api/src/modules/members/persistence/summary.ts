import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql } from '../../projects/access.ts';
import { required } from '../../../shared/errors.ts';
export async function memberTaskCounts(
  repository: RequestRepository,
  scope: WorkspaceContext,
  id: string,
  date: string,
) {
  return required(
    (
      await repository.all<{ open: number; done: number; overdue: number }>(
        `SELECT coalesce(sum(t.status!='done'),0) open,coalesce(sum(t.status='done'),0) done,coalesce(sum(t.status!='done' AND t.dueDate IS NOT NULL AND t.dueDate<?),0) overdue FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.assigneeId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql}`,
        [date, scope.workspaceId, id, scope.memberId],
      )
    )[0],
    'Missing member counts',
  );
}
export function memberProjectIds(
  repository: RequestRepository,
  scope: WorkspaceContext,
  id: string,
) {
  return repository.all<{ id: string }>(
    `SELECT p.id FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND p.status!='complete' AND EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?) AND ${readAccessSql} ORDER BY p.id`,
    [scope.workspaceId, id, scope.memberId],
  );
}
