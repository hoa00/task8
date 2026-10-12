import type { EntityId } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { files } from '../../../db/schema.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { readAccessSql as accessSql } from '../../projects/access.ts';
import type { SubtaskRow, TaskProjection, TaskRow } from './model.ts';

export const taskProjectionColumns = `t.*,p.key projectKey,
 (SELECT json_group_array(labelId) FROM (SELECT labelId FROM taskLabels WHERE workspaceId=t.workspaceId AND taskId=t.id ORDER BY rowid)) labelsJson,
 (SELECT json_group_array(dependsOnTaskId) FROM (SELECT dependsOnTaskId FROM taskDependencies WHERE workspaceId=t.workspaceId AND taskId=t.id ORDER BY dependsOnTaskId)) dependenciesJson,
 (SELECT json_group_array(d.dependsOnTaskId) FROM taskDependencies d JOIN tasks dep ON dep.workspaceId=d.workspaceId AND dep.id=d.dependsOnTaskId JOIN projects dp ON dp.workspaceId=dep.workspaceId AND dp.id=dep.projectId WHERE d.workspaceId=t.workspaceId AND d.taskId=t.id AND dep.archivedAt IS NULL AND dep.deletedAt IS NULL AND dp.archivedAt IS NULL AND dp.deletedAt IS NULL AND (dp.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=dp.workspaceId AND pm.projectId=dp.id AND pm.memberId=?))) visibleDependenciesJson,
 (SELECT count(*) FROM subtasks WHERE workspaceId=t.workspaceId AND taskId=t.id) subtaskTotal,
 (SELECT count(*) FROM subtasks WHERE workspaceId=t.workspaceId AND taskId=t.id AND done=1) subtaskDone,
 (SELECT count(*) FROM files WHERE workspaceId=t.workspaceId AND taskId=t.id AND deletedAt IS NULL) attachmentCount,
 (SELECT count(*) FROM comments WHERE workspaceId=t.workspaceId AND taskId=t.id AND deletedAt IS NULL) commentCount,
 EXISTS (SELECT 1 FROM taskFavorites WHERE workspaceId=t.workspaceId AND taskId=t.id AND memberId=?) favorite
`;
export const taskSelect = `SELECT ${taskProjectionColumns} FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId`;
export async function taskRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  deleted = false,
) {
  const [row] = await r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.id=? ${deleted ? '' : 'AND t.deletedAt IS NULL'} AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}`,
    [s.memberId, s.memberId, s.workspaceId, id, s.memberId],
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Task not found');
  return row;
}
export async function childRows(r: RequestRepository, s: WorkspaceContext, id: string) {
  return r.all<SubtaskRow>(
    'SELECT * FROM subtasks WHERE workspaceId=? AND taskId=? ORDER BY position,id',
    [s.workspaceId, id],
  );
}
export async function recurrenceSlots(r: RequestRepository, s: WorkspaceContext, id: string) {
  return r.all<TaskRow>('SELECT * FROM tasks WHERE workspaceId=? AND recurrenceSourceTaskId=?', [
    s.workspaceId,
    id,
  ]);
}
export async function requestTask(r: RequestRepository, s: WorkspaceContext, requestId: string) {
  return r.all<TaskRow>(
    'SELECT * FROM tasks WHERE workspaceId=? AND createdBy=? AND createRequestId=?',
    [s.workspaceId, s.memberId, requestId],
  );
}
export async function keyTaskId(r: RequestRepository, s: WorkspaceContext, key: string) {
  const [row] = await r.all<{ id: string }>(
    "SELECT t.id FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND p.key||'-'||t.number=?",
    [s.workspaceId, key],
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Task not found');
  return EntityIdSchema.parse(row.id);
}

export async function attachmentRows(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string,
  projectId: string,
) {
  return r.all<typeof files.$inferSelect>(
    'SELECT * FROM files WHERE workspaceId=? AND taskId=? AND projectId=? AND deletedAt IS NULL ORDER BY createdAt,id',
    [s.workspaceId, id, projectId],
  );
}
