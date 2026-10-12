import { exactSet } from '../../../db/commands.ts';
import type { WorkspaceContext } from '../../../shared/scope.ts';
import type { SubtaskRow, TaskRow } from './model.ts';
export function childSnapshotGuard(s: WorkspaceContext, id: string, rows: readonly SubtaskRow[]) {
  return exactSet('subtasks', 'workspaceId=? AND taskId=?', [s.workspaceId, id], rows, [
    'id',
    'title',
    'done',
    'assigneeId',
    'dueDate',
    'note',
    'position',
    'createdAt',
    'updatedAt',
  ]);
}
export function recurrenceSnapshotGuard(s: WorkspaceContext, id: string, rows: readonly TaskRow[]) {
  return exactSet(
    'tasks',
    'workspaceId=? AND recurrenceSourceTaskId=?',
    [s.workspaceId, id],
    rows,
    ['id', 'version', 'recurrenceSourceTaskId'],
  );
}
