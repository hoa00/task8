import type { EntityId, MoveTaskInput, TaskMutationDto } from '@studio/contracts/api';
import {
  EntityIdSchema,
  InstantSchema,
  TaskQuerySchema,
  TaskStatusSchema,
} from '@studio/contracts/api';
import { filterTasks, groupTasks } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { planTaskOrder } from '../domain/ordering.ts';
import { taskDto } from '../mapper.ts';
import { authorizedScopeGuard, neighborGuard } from '../persistence/ordering.ts';
import { taskRow } from '../persistence/reads.ts';
import { taskDataset } from './queries.ts';
import { requireResultTask } from './result.ts';

import {
  active,
  allocation,
  conflict,
  empty,
  event,
  execute,
  merge,
  recurrence,
  transition,
  version,
} from './planning.ts';
export async function moveTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: MoveTaskInput,
  now: number,
  generateId: IdGenerator = newId,
): Promise<TaskMutationDto> {
  const old = await taskRow(r, s, id);
  version(old, body.expectedVersion);
  active(old);
  const plan = empty(generateId);
  plan.before = [old];
  const dataset = await taskDataset(r, s, now);
  // Remove grouping fields before strict TaskQuery parsing.
  const { groupBy, groupKey, ...queryInput } = body.scope;
  const destination = TaskQuerySchema.parse({
    ...queryInput,
    ...(body.targetProjectId ? { projectId: body.targetProjectId } : {}),
  });
  const next = merge(transition(old, body.groupPatch?.status ?? old.status, now), {
    ...body.groupPatch,
    projectId: body.targetProjectId ?? old.projectId,
  });
  next.completedAt = transition(old, body.groupPatch?.status ?? old.status, now).completedAt;
  next.previousStatus = transition(old, body.groupPatch?.status ?? old.status, now).previousStatus;
  const projected = merge(taskDto(old), {
    ...body.groupPatch,
    projectId: EntityIdSchema.parse(next.projectId),
    status: TaskStatusSchema.parse(next.status),
    completedAt: next.completedAt === null ? null : InstantSchema.parse(instant(next.completedAt)),
  });
  if (!filterTasks([projected], destination, dataset.env).length)
    throw new ApiFailure('VALIDATION_ERROR', 'Task does not match destination scope');
  const candidates = filterTasks(dataset.items, destination, dataset.env).filter(
      (t) => t.id !== id,
    ),
    group =
      groupBy && groupBy !== 'none'
        ? groupTasks([...candidates, projected], groupBy, dataset.env).find(
            (g) => g.key === (groupKey === null ? 'none' : groupKey),
          )
        : null;
  if (groupBy && groupBy !== 'none' && (!group || !group.taskIds.includes(id)))
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid destination group');
  const ids = group ? new Set(group.taskIds) : null,
    neighbors = candidates
      .filter((t) => !ids || ids.has(t.id))
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const order = planTaskOrder(neighbors, id, body.beforeId, body.afterId);
  next.position = order.position;
  for (const entry of order.neighbors) {
    const oldNeighbor = dataset.rows.find((t) => t.id === entry.id);
    if (!oldNeighbor) throw new ApiFailure('INTERNAL_ERROR', 'Missing task neighbor');
    if (oldNeighbor.position !== entry.position) {
      plan.before.push(oldNeighbor);
      plan.changed.push({ ...oldNeighbor, position: entry.position });
    }
  }
  plan.guards.push(neighborGuard(s, neighbors), authorizedScopeGuard(s, dataset.rows));
  if (next.projectId !== old.projectId) next.number = allocation(plan, next.projectId);
  plan.changed.push(next);
  plan.events = [event(s, next, now, 'task.moved', plan.ids)];
  await recurrence(r, s, old, next, plan, now);
  const result = conflict(await execute(r, s, plan, now));
  return {
    task: requireResultTask(result.tasks.find((t) => t.id === id)),
    createdTasks: result.createdTasks,
    affectedProjectIds: result.affectedProjectIds,
    undo: null,
  };
}
