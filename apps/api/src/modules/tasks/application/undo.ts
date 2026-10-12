import type { UndoResultDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
import { decodeUndoResult } from '../../../db/undo.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { validateRelations } from '../persistence/relations.ts';
import { decodeTaskUndoPayload } from '../persistence/undo-model.ts';
import { undoProjectRows, undoTaskRows } from '../persistence/undo-reads.ts';
import { commitTaskUndo } from '../persistence/undo.ts';

export async function undoTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  record: typeof commandUndoRecords.$inferSelect,
  now: number,
  generateId: IdGenerator = newId,
): Promise<UndoResultDto> {
  const payload = decodeTaskUndoPayload(record.payloadJson);
  if (
    ![
      'task.complete',
      'task.archive',
      'task.delete',
      'tasks.bulkDelete',
      'tasks.completeColumn',
      'tasks.archiveCompletedColumn',
    ].includes(payload.kind) ||
    payload.kind !== record.kind
  )
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid task Undo');
  const ids = payload.targets.map((t) => t.id),
    rows = await undoTaskRows(r, s, ids);
  if (rows.length !== ids.length) throw new ApiFailure('NOT_FOUND', 'Undo task not found');
  const projectIds = [
      ...new Set([
        ...rows.map((t) => t.projectId),
        ...('columnScope' in payload && payload.columnScope.kind === 'project'
          ? [payload.columnScope.projectId]
          : []),
      ]),
    ],
    projects = projectIds.length ? await undoProjectRows(r, s, projectIds) : [];
  if (projects.length !== projectIds.length)
    throw new ApiFailure('NOT_FOUND', 'Undo project not found');
  if (projects.some((p) => !p.allowed))
    throw new ApiFailure('FORBIDDEN', 'Undo project access required');
  if (projects.some((p) => p.archivedAt !== null || p.deletedAt !== null))
    throw new ApiFailure('CONFLICT', 'Undo parent lifecycle changed');
  const access = await validateRelations(
    r,
    s,
    projectIds.map((projectId) => ({
      id: generateId(),
      projectId,
      assigneeId: null,
      dependencyIds: [],
      subtaskAssigneeIds: [],
    })),
  );
  if (record.resultJson !== null) return decodeUndoResult(record.resultJson);
  return commitTaskUndo(r, s, record, now, payload, rows, access, generateId);
}
