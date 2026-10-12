import type {
  BulkMutateTasksInput,
  EntityId,
  MoveTaskInput,
  TaskStatus,
} from '@studio/contracts/api';
import { EntityIdSchema, InstantSchema, TaskQuerySchema, priorities } from '@studio/contracts/api';
import { filterTasks, groupTasks } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../db/client.ts';
import { exactSet } from '../db/commands.ts';
import { instant } from '../shared/clock.ts';
import { ApiFailure } from '../shared/errors.ts';
import { newId } from '../shared/ids.ts';
import type { SubtaskRow, TaskRow } from './read-model.ts';
import { taskDataset, taskDto, taskRow } from './task-read.ts';
import { validateRelations } from './task-relations.ts';
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
  undoPlan,
  version,
} from './tasks/application/planning.ts';
export { transition } from './tasks/application/planning.ts';
export {
  completeTask,
  createTask,
  duplicateTask,
  favoriteTask,
  lifecycleTask,
  updateTask,
} from './tasks/index.ts';
export async function moveTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: MoveTaskInput,
  now: number,
) {
  const old = await taskRow(r, s, id);
  version(old, body.expectedVersion);
  active(old);
  const plan = empty();
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
    status: next.status as TaskStatus,
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
  let at = neighbors.length;
  if (body.beforeId) {
    at = neighbors.findIndex((t) => t.id === body.beforeId);
    if (at < 0) throw new ApiFailure('VALIDATION_ERROR', 'Invalid before neighbor');
  }
  if (body.afterId) {
    const ai = neighbors.findIndex((t) => t.id === body.afterId);
    if (ai < 0 || (body.beforeId && ai + 1 !== at))
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid adjacent neighbors');
    at = ai + 1;
  }
  const lower = neighbors[at - 1]?.position,
    upper = neighbors[at]?.position;
  next.position =
    lower === undefined
      ? upper === undefined
        ? 0
        : upper - 100
      : upper === undefined
        ? lower + 100
        : Math.floor((lower + upper) / 2);
  if (
    !Number.isSafeInteger(next.position) ||
    (lower !== undefined && upper !== undefined && next.position <= lower)
  ) {
    if (neighbors.length + 1 > 128)
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Ordering scope exceeds bounded rebalance');
    const order = [...neighbors];
    order.splice(at, 0, projected);
    const base = neighbors.length ? Math.min(...neighbors.map((t) => t.position)) : 0;
    for (const [index, t] of order.entries()) {
      const position = base + index * 100;
      if (!Number.isSafeInteger(position))
        throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Ordering exceeds integer range');
      if (t.id === id) {
        next.position = position;
        continue;
      }
      const oldNeighbor = dataset.rows.find((r) => r.id === t.id)!;
      if (oldNeighbor.position !== position) {
        plan.before.push(oldNeighbor);
        plan.changed.push({ ...oldNeighbor, position });
      }
    }
  }
  plan.guards.push(
    exactSet(
      'tasks',
      'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
      [s.workspaceId, JSON.stringify(neighbors.map((t) => t.id))],
      neighbors,
      ['id', 'version', 'position', 'projectId', 'status', 'priority', 'assigneeId'],
    ),
  );
  // Exact authorized scope blocks a new/changed neighbor between read and batch.
  plan.guards.push(
    exactSet(
      'tasks',
      `workspaceId=? AND deletedAt IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?)))`,
      [s.workspaceId, s.memberId],
      dataset.rows,
      ['id', 'version', 'position', 'projectId', 'archivedAt', 'deletedAt'],
    ),
  );
  if (next.projectId !== old.projectId) next.number = allocation(plan, next.projectId);
  plan.changed.push(next);
  plan.events = [event(s, next, now, 'task.moved', plan.ids)];
  await recurrence(r, s, old, next, plan, now);
  const result = conflict(await execute(r, s, plan, now));
  return {
    task: result.tasks.find((t) => t.id === id)!,
    createdTasks: result.createdTasks,
    affectedProjectIds: result.affectedProjectIds,
    undo: null,
  };
}
export async function bulkTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  body: BulkMutateTasksInput,
  now: number,
) {
  const dataset = await taskDataset(r, s, now),
    plan = empty(),
    ids = body.items.map((t) => t.id);
  for (const item of body.items) {
    const row = dataset.rows.find((t) => t.id === item.id);
    if (!row) throw new ApiFailure('NOT_FOUND', 'Task not found');
    version(row, item.expectedVersion);
    active(row);
    plan.before.push(row);
  }
  if ('columnScope' in body) {
    const column = body.columnScope;
    plan.intent = { kind: 'column', scope: column, operation: body.operation };
    if (column.kind === 'project')
      plan.guards.push(
        await validateRelations(r, s, [
          {
            id: newId(),
            projectId: column.projectId,
            assigneeId: null,
            dependencyIds: [],
            subtaskAssigneeIds: [],
          },
        ]),
      );
    const matches = dataset.rows.filter(
      (t) =>
        t.archivedAt === null &&
        t.status === column.status &&
        (column.kind === 'workspace' || t.projectId === column.projectId),
    );
    if (matches.length > 20)
      throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Column exceeds maxBulkItems');
    if (
      matches.length !== ids.length ||
      matches.some((t) => !ids.includes(EntityIdSchema.parse(t.id)))
    )
      throw new ApiFailure('CONFLICT', 'Column ID/version set changed');
    const where = `workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL AND status=? ${column.kind === 'project' ? 'AND projectId=?' : ''} AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?)))`;
    plan.guards.push(
      exactSet(
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
      ),
    );
  }
  if (body.operation === 'patch' || body.operation === 'complete') {
    const idsJson = JSON.stringify(ids),
      where = 'workspaceId=? AND taskId IN (SELECT value FROM json_each(?))';
    plan.sourceChildren = await r.all<SubtaskRow>(`SELECT * FROM subtasks WHERE ${where}`, [
      s.workspaceId,
      idsJson,
    ]);
    plan.slots = await r.all<TaskRow>(
      'SELECT * FROM tasks WHERE workspaceId=? AND recurrenceSourceTaskId IN (SELECT value FROM json_each(?))',
      [s.workspaceId, idsJson],
    );
    plan.guards.push(
      exactSet('subtasks', where, [s.workspaceId, idsJson], plan.sourceChildren, [
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
        [s.workspaceId, idsJson],
        plan.slots,
        ['id', 'version', 'recurrenceSourceTaskId'],
      ),
    );
  }
  if (body.operation === 'delete') plan.intent = { kind: 'lifecycle' };
  const sorted = [...plan.before].sort(
      (a, b) =>
        priorities.find((p) => p.id === b.priority)!.weight -
          priorities.find((p) => p.id === a.priority)!.weight || a.id.localeCompare(b.id),
    ),
    base = Math.min(...plan.before.map((t) => t.position));
  if (body.operation === 'sortPriority') plan.before = sorted;
  for (const old of plan.before) {
    let next: TaskRow = { ...old };
    if (body.operation === 'patch') {
      next = merge(next, body.patch);
      if (next.startDate && next.dueDate && next.startDate > next.dueDate)
        throw new ApiFailure('VALIDATION_ERROR', 'startDate exceeds dueDate');
      if (body.patch.status !== undefined)
        next = {
          ...next,
          completedAt: transition(old, body.patch.status, now).completedAt,
          previousStatus: transition(old, body.patch.status, now).previousStatus,
        };
    } else if (body.operation === 'complete') {
      if (old.status === 'done') continue;
      next = transition(old, 'done', now);
    } else if (body.operation === 'archive') next.archivedAt = now;
    else if (body.operation === 'delete') {
      next.deletedAt = now;
      next.deletedBy = s.memberId;
    } else next.position = base + sorted.findIndex((t) => t.id === old.id) * 100;
    plan.changed.push(next);
    if (body.operation !== 'sortPriority')
      plan.events.push(
        event(
          s,
          next,
          now,
          body.operation === 'delete'
            ? 'task.deleted'
            : body.operation === 'archive'
              ? 'task.archived'
              : next.status === 'done' && old.status !== 'done'
                ? 'task.completed'
                : 'task.updated',
          plan.ids,
        ),
      );
    if (body.operation === 'patch' || body.operation === 'complete')
      await recurrence(r, s, old, next, plan, now);
  }
  if (body.operation === 'complete')
    plan.dependencyTargets = [
      ...new Set(
        plan.created.flatMap((t) =>
          plan.dependencies.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
        ),
      ),
    ]
      .filter(
        (id) => !plan.changed.some((t) => t.id === id) && !plan.created.some((t) => t.id === id),
      )
      .map((id) => dataset.rows.find((t) => t.id === id)!);
  if (body.operation === 'delete') undoPlan(s, plan, 'tasks.bulkDelete');
  else if (body.operation === 'archive') undoPlan(s, plan, 'tasks.archiveCompletedColumn');
  else if (body.operation === 'complete' && plan.changed.length)
    undoPlan(s, plan, 'tasks.completeColumn', true);
  return conflict(await execute(r, s, plan, now));
}
