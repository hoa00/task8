import type { BulkMutateTasksInput, BulkTaskMutationDto } from '@studio/contracts/api';
import { EntityIdSchema, PrioritySchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { priorityWeight } from '../domain/ordering.ts';
import type { TaskRow } from '../persistence/model.ts';
import { bulkRecurrenceScope, columnGuard } from '../persistence/ordering.ts';
import { validateRelations } from '../persistence/relations.ts';
import { taskDataset } from './queries.ts';

import {
  active,
  conflict,
  empty,
  event,
  execute,
  merge,
  recurrence,
  transition,
  undoPlan,
  version,
} from './planning.ts';
export async function bulkTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  body: BulkMutateTasksInput,
  now: number,
  generateId: IdGenerator = newId,
): Promise<BulkTaskMutationDto> {
  const dataset = await taskDataset(r, s, now),
    plan = empty(generateId),
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
            id: generateId(),
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
    plan.guards.push(columnGuard(s, column, matches));
  }
  if (body.operation === 'patch' || body.operation === 'complete') {
    const scope = await bulkRecurrenceScope(r, s, ids);
    plan.sourceChildren = scope.children;
    plan.slots = scope.slots;
    plan.guards.push(...scope.guards);
  }
  if (body.operation === 'delete') plan.intent = { kind: 'lifecycle' };
  const sorted = [...plan.before].sort(
      (a, b) =>
        priorityWeight(PrioritySchema.parse(b.priority)) -
          priorityWeight(PrioritySchema.parse(a.priority)) || a.id.localeCompare(b.id),
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
      .map((id) => {
        const row = dataset.rows.find((t) => t.id === id);
        if (!row) throw new ApiFailure('INTERNAL_ERROR', 'Missing dependency target');
        return row;
      });
  if (body.operation === 'delete') undoPlan(s, plan, 'tasks.bulkDelete');
  else if (body.operation === 'archive') undoPlan(s, plan, 'tasks.archiveCompletedColumn');
  else if (body.operation === 'complete' && plan.changed.length)
    undoPlan(s, plan, 'tasks.completeColumn', true);
  return conflict(await execute(r, s, plan, now));
}
