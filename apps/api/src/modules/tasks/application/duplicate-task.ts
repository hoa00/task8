import type { TaskMutationDto } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { TaskRow } from '../persistence/model.ts';
import { taskRow } from '../persistence/reads.ts';
import { validateRelations } from '../persistence/relations.ts';
import { labelIds, relation, visibleDependencies } from '../persistence/values.ts';
import {
  active,
  allocation,
  conflict,
  copiedChildren,
  depRows,
  empty,
  event,
  execute,
  labelRows,
  version,
} from './planning.ts';
import { requireResultTask } from './result.ts';

import type { DuplicateTaskInput, EntityId } from '@studio/contracts/api';
import { NameSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export async function duplicateTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: DuplicateTaskInput,
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskMutationDto> {
  const old = await taskRow(r, s, id);
  version(old, body.expectedVersion);
  active(old);
  const plan = empty(ids);
  plan.before = [old];
  const copy: TaskRow = {
    ...old,
    id: ids(),
    number: allocation(plan, old.projectId),
    title: NameSchema.parse(body.title ?? `${old.title} (copy)`),
    status: 'todo',
    completedAt: null,
    previousStatus: null,
    recurrenceSourceTaskId: null,
    cancelledByUndoId: null,
    createRequestId: null,
    createRequestHash: null,
    createdBy: s.memberId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    lastMutationId: null,
  };
  plan.created = [copy];
  const children = await copiedChildren(r, s, old, plan, copy.id);
  plan.labels = labelRows(s, copy.id, labelIds(old));
  plan.dependencies = depRows(s, copy.id, visibleDependencies(old));
  plan.guards.push(
    await validateRelations(r, s, [relation(copy, visibleDependencies(old), children)]),
  );
  plan.events = [event(s, copy, now, 'task.created', ids)];
  const result = conflict(await execute(r, s, plan, now));
  return {
    task: requireResultTask(result.createdTasks[0]),
    createdTasks: [],
    affectedProjectIds: result.affectedProjectIds,
    undo: null,
  };
}
