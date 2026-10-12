import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { TaskProjection } from './model.ts';
import { taskSelect } from './reads.ts';
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
