import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export function parentReadTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  taskId: string,
  projectId: string,
) {
  return r.all<{ id: string; version: number }>(
    'SELECT id,version FROM tasks WHERE workspaceId=? AND id=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL',
    [s.workspaceId, taskId, projectId],
  );
}
