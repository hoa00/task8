import type { TaskMutationDto } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { taskRow } from '../persistence/reads.ts';
import { conflict, empty, event, execute, undoPlan, version } from './planning.ts';
import { requireResultTask } from './result.ts';

import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';

export async function lifecycleTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  expectedVersion: number,
  operation: 'archive' | 'restore' | 'delete' | 'restore-deleted',
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskMutationDto> {
  const old = await taskRow(r, s, id, operation === 'restore-deleted');
  version(old, expectedVersion);
  if (
    (operation === 'archive' && old.archivedAt !== null) ||
    (operation === 'restore' && old.archivedAt === null) ||
    (operation === 'restore-deleted' && (old.deletedAt === null || old.cancelledByUndoId !== null))
  )
    throw new ApiFailure('CONFLICT', 'Task lifecycle changed');
  if (operation === 'restore-deleted' && old.deletedBy !== s.memberId)
    throw new ApiFailure('FORBIDDEN', 'Only deleting member can restore task');
  const plan = empty(ids);
  plan.intent = { kind: 'lifecycle' };
  plan.before = [old];
  plan.changed = [
    {
      ...old,
      archivedAt: operation === 'archive' ? now : operation === 'restore' ? null : old.archivedAt,
      deletedAt:
        operation === 'delete' ? now : operation === 'restore-deleted' ? null : old.deletedAt,
      deletedBy:
        operation === 'delete'
          ? s.memberId
          : operation === 'restore-deleted'
            ? null
            : old.deletedBy,
    },
  ];
  plan.events = [
    event(
      s,
      old,
      now,
      operation === 'archive'
        ? 'task.archived'
        : operation === 'delete'
          ? 'task.deleted'
          : 'task.updated',
      ids,
    ),
  ];
  if (operation === 'archive' || operation === 'delete')
    undoPlan(s, plan, operation === 'archive' ? 'task.archive' : 'task.delete');
  const result = conflict(await execute(r, s, plan, now));
  return {
    task: requireResultTask(result.tasks[0]),
    createdTasks: [],
    affectedProjectIds: result.affectedProjectIds,
    undo: result.undo,
  };
}
