import type { ColumnScope, TaskDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { exactSet } from '../../../db/commands.ts';
import type { SubtaskRow, TaskProjection, TaskRow } from './model.ts';
export function neighborGuard(s: WorkspaceContext, neighbors: readonly TaskDto[]) {
  return exactSet(
    'tasks',
    'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(neighbors.map((t) => t.id))],
    neighbors,
    ['id', 'version', 'position', 'projectId', 'status', 'priority', 'assigneeId'],
  );
}
export function authorizedScopeGuard(s: WorkspaceContext, rows: readonly TaskProjection[]) {
  return exactSet(
    'tasks',
    `workspaceId=? AND deletedAt IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?)))`,
    [s.workspaceId, s.memberId],
    rows,
    ['id', 'version', 'position', 'projectId', 'archivedAt', 'deletedAt'],
  );
}
export function columnGuard(
  s: WorkspaceContext,
  column: ColumnScope,
  matches: readonly TaskProjection[],
) {
  const where = `workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL AND status=? ${column.kind === 'project' ? 'AND projectId=?' : ''} AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?)))`;
  return exactSet(
    'tasks',
    where,
    [
      s.workspaceId,
      column.status,
      ...(column.kind === 'project' ? [column.projectId] : []),
      s.memberId,
    ],
    matches,
    ['id', 'version'],
  );
}
export async function bulkRecurrenceScope(
  r: RequestRepository,
  s: WorkspaceContext,
  ids: readonly string[],
) {
  const json = JSON.stringify(ids),
    where = 'workspaceId=? AND taskId IN (SELECT value FROM json_each(?))';
  const children = await r.all<SubtaskRow>(`SELECT * FROM subtasks WHERE ${where}`, [
    s.workspaceId,
    json,
  ]);
  const slots = await r.all<TaskRow>(
    'SELECT * FROM tasks WHERE workspaceId=? AND recurrenceSourceTaskId IN (SELECT value FROM json_each(?))',
    [s.workspaceId, json],
  );
  return {
    children,
    slots,
    guards: [
      exactSet('subtasks', where, [s.workspaceId, json], children, [
        'id',
        'taskId',
        'title',
        'done',
        'assigneeId',
        'dueDate',
        'note',
        'position',
        'createdAt',
        'updatedAt',
      ]),
      exactSet(
        'tasks',
        'workspaceId=? AND recurrenceSourceTaskId IN (SELECT value FROM json_each(?))',
        [s.workspaceId, json],
        slots,
        ['id', 'version', 'recurrenceSourceTaskId'],
      ),
    ],
  };
}
