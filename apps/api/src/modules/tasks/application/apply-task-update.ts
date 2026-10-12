import type { TaskMutationDto, TaskStatus } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { normalizeTaskDescription } from '../domain/description.ts';
import type { TaskRow } from '../persistence/model.ts';
import { taskRow } from '../persistence/reads.ts';
import { validateRelations } from '../persistence/relations.ts';
import { relation } from '../persistence/values.ts';
import {
  active,
  conflict,
  depRows,
  empty,
  event,
  execute,
  labelRows,
  merge,
  recurrence,
  transition,
  undoPlan,
  version,
} from './planning.ts';
import { requireResultTask } from './result.ts';
export type TaskUpdateIntent =
  | { kind: 'patch'; input: UpdateTaskInput }
  | { kind: 'completion'; input: SetTaskCompletionInput; status: TaskStatus };

import type { EntityId, SetTaskCompletionInput, UpdateTaskInput } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';

export async function applyTaskUpdate(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  intent: TaskUpdateIntent,
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskMutationDto> {
  const body: UpdateTaskInput =
    intent.kind === 'patch'
      ? intent.input
      : { expectedVersion: intent.input.expectedVersion, status: intent.status };
  const completion = intent.kind === 'completion' ? intent.input : undefined;
  const old = await taskRow(r, s, id);
  version(old, body.expectedVersion);
  active(old);
  const plan = empty(ids);
  plan.before = [old];
  const { expectedVersion: _, labelIds: labels, dependencyIds: deps, ...patch } = body;
  void _;
  if (completion && completion.completed === (old.status === 'done')) {
    plan.guards.push(await validateRelations(r, s, [relation(old, [])]));
    const result = conflict(await execute(r, s, plan, now));
    return {
      task: requireResultTask(result.tasks[0]),
      createdTasks: [],
      affectedProjectIds: result.affectedProjectIds,
      undo: null,
    };
  }
  let next: TaskRow = merge(transition(old, patch.status ?? old.status, now), patch);
  if (patch.descriptionHtml !== undefined) {
    const description = normalizeTaskDescription(patch.descriptionHtml);
    next = { ...next, descriptionHtml: description.html, descriptionText: description.text };
  }
  if (next.startDate && next.dueDate && next.startDate > next.dueDate)
    throw new ApiFailure('VALIDATION_ERROR', 'startDate exceeds dueDate');
  plan.changed = [next];
  if (labels !== undefined) {
    plan.replaceLabels = [id];
    plan.labels = labelRows(s, id, labels);
  }
  if (deps !== undefined) {
    plan.replaceDependencies = [id];
    plan.dependencies = depRows(s, id, deps);
  }
  plan.events = [
    event(
      s,
      next,
      now,
      next.status === 'done' && old.status !== 'done' ? 'task.completed' : 'task.updated',
      ids,
    ),
  ];
  await recurrence(r, s, old, next, plan, now);
  if (completion?.completed && old.status !== 'done') undoPlan(s, plan, 'task.complete');
  const result = conflict(await execute(r, s, plan, now));
  return {
    task: requireResultTask(result.tasks[0]),
    createdTasks: result.createdTasks,
    affectedProjectIds: result.affectedProjectIds,
    undo: result.undo,
  };
}
