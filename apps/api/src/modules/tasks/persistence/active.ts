import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql as accessSql } from '../../projects/access.ts';
import type { TaskProjection, TaskRow } from './model.ts';
import { taskSelect } from './reads.ts';
export async function activeTasks(r: RequestRepository, s: WorkspaceContext) {
  return r.all<TaskRow>(
    `SELECT t.* FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} ORDER BY t.position,t.id`,
    [s.workspaceId, s.memberId],
  );
}

export async function projectTaskRows(
  r: RequestRepository,
  s: WorkspaceContext,
  projectId: string,
) {
  return r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.projectId=? ORDER BY t.position,t.id`,
    [s.memberId, s.memberId, s.workspaceId, projectId],
  );
}
