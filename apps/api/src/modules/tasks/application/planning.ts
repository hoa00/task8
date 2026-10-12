import { DateOnlySchema, RecurrenceSchema } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { transitionCompletion } from '../domain/completion.ts';
import { normalizeTaskDescription } from '../domain/description.ts';
import { completionProjection, taskDto } from '../mapper.ts';
import { execute as executePlan } from '../persistence/commands.ts';
import type { TaskProjection, TaskRow } from '../persistence/model.ts';
import type { Plan } from '../persistence/plan.ts';
import { childRows, recurrenceSlots, requestTask, taskRow } from '../persistence/reads.ts';
import { labelIds, visibleDependencies } from '../persistence/values.ts';

import type { CreateTaskInput, UndoDescriptor } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import { nextRecurrenceDate } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { exactSet } from '../../../db/commands.ts';
import { encodeUndoPayload } from '../../../db/undo.ts';
import { instant, nullableInstant } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { newId } from '../../../shared/ids.ts';

export const empty = (ids: IdGenerator = newId): Plan => ({
  ids,
  intent: { kind: 'mutation' },
  sourceChildren: null,
  slots: null,
  dependencyTargets: [],
  before: [],
  changed: [],
  created: [],
  children: [],
  labels: [],
  dependencies: [],
  replaceLabels: [],
  replaceDependencies: [],
  guards: [],
  undo: null,
  events: [],
  allocations: [],
});
export function merge<T extends object>(row: T, patch: { [K in keyof T]?: T[K] | undefined }): T {
  return {
    ...row,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  };
}
export function transition(t: TaskRow, status: string, now: number): TaskRow {
  return {
    ...t,
    ...transitionCompletion(
      completionProjection(t),
      completionProjection({ ...t, status }).status,
      now,
    ),
  };
}
export const version = (row: TaskRow, expected: number) => {
  if (row.version !== expected) throw new ApiFailure('CONFLICT', 'Task version changed');
};
export const active = (row: TaskRow) => {
  if (row.archivedAt !== null || row.deletedAt !== null)
    throw new ApiFailure('CONFLICT', 'Restore task before editing');
};
export function event(
  s: WorkspaceContext,
  t: TaskRow,
  now: number,
  type: string,
  ids: IdGenerator,
) {
  return {
    id: ids(),
    workspaceId: s.workspaceId,
    projectId: t.projectId,
    taskId: t.id,
    actorId: s.memberId,
    eventType: type,
    payloadJson: JSON.stringify({ taskTitle: t.title, status: t.status }),
    commandId: null,
    revertedAt: null,
    createdAt: now,
  };
}
export function allocation(plan: Plan, projectId: string) {
  let row = plan.allocations.find((a) => a.projectId === projectId);
  if (!row) {
    row = { projectId, count: 0 };
    plan.allocations.push(row);
  }
  return ++row.count;
}
export function labelRows(s: WorkspaceContext, id: string, ids: string[]) {
  return ids.map((labelId) => ({ workspaceId: s.workspaceId, taskId: id, labelId }));
}
export function depRows(s: WorkspaceContext, id: string, ids: string[]) {
  return ids.map((dependsOnTaskId) => ({
    workspaceId: s.workspaceId,
    taskId: id,
    dependsOnTaskId,
  }));
}
export function baseTask(
  s: WorkspaceContext,
  body: CreateTaskInput,
  now: number,
  ids: IdGenerator,
): TaskRow {
  const description = normalizeTaskDescription(body.descriptionHtml);
  return {
    id: ids(),
    workspaceId: s.workspaceId,
    projectId: body.projectId,
    number: 0,
    title: body.title,
    descriptionHtml: description.html,
    descriptionText: description.text,
    status: body.status,
    priority: body.priority,
    assigneeId: body.assigneeId,
    startDate: body.startDate,
    dueDate: body.dueDate,
    estimate: body.estimate,
    recurrence: body.recurrence,
    position: 0,
    completedAt: body.status === 'done' ? now : null,
    previousStatus: body.status === 'done' ? 'todo' : null,
    recurrenceSourceTaskId: null,
    cancelledByUndoId: null,
    createdBy: s.memberId,
    createRequestId: body.clientRequestId,
    createRequestHash: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    lastMutationId: null,
  };
}
export async function copiedChildren(
  r: RequestRepository,
  s: WorkspaceContext,
  t: TaskProjection,
  plan: Plan,
  newTaskId: string,
) {
  const rows = plan.sourceChildren
    ? plan.sourceChildren.filter((c) => c.taskId === t.id)
    : await childRows(r, s, t.id);
  if (!plan.sourceChildren)
    plan.guards.push(
      exactSet('subtasks', 'workspaceId=? AND taskId=?', [s.workspaceId, t.id], rows, [
        'id',
        'title',
        'done',
        'assigneeId',
        'dueDate',
        'note',
        'position',
        'createdAt',
        'updatedAt',
      ]),
    );
  const copied = rows.map((c) => ({
    ...c,
    id: plan.ids(),
    taskId: newTaskId,
    done: false,
    createdAt: requireCreated(plan, newTaskId).createdAt,
    updatedAt: requireCreated(plan, newTaskId).updatedAt,
  }));
  plan.children.push(...copied);
  return copied;
}
export async function recurrence(
  r: RequestRepository,
  s: WorkspaceContext,
  old: TaskProjection,
  next: TaskRow,
  plan: Plan,
  now: number,
) {
  if (old.status === 'done' || next.status !== 'done' || !next.recurrence || !next.dueDate) return;
  const existing = plan.slots
    ? plan.slots.filter((t) => t.recurrenceSourceTaskId === old.id)
    : await recurrenceSlots(r, s, old.id);
  if (!plan.slots)
    plan.guards.push(
      exactSet(
        'tasks',
        'workspaceId=? AND recurrenceSourceTaskId=?',
        [s.workspaceId, old.id],
        existing,
        ['id', 'version', 'recurrenceSourceTaskId'],
      ),
    );
  if (existing.length) return;
  const due = nextRecurrenceDate(
      DateOnlySchema.parse(next.dueDate),
      RecurrenceSchema.parse(next.recurrence),
    ),
    id = plan.ids();
  const created: TaskRow = {
    ...next,
    id,
    number: allocation(plan, next.projectId),
    position: 0,
    status: 'todo',
    completedAt: null,
    previousStatus: null,
    startDate: due,
    dueDate: due,
    createdBy: s.memberId,
    createRequestId: null,
    createRequestHash: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    recurrenceSourceTaskId: old.id,
    lastMutationId: null,
  };
  plan.created.push(created);
  plan.labels.push(
    ...labelRows(
      s,
      id,
      plan.replaceLabels.includes(old.id)
        ? plan.labels.filter((l) => l.taskId === old.id).map((l) => l.labelId)
        : labelIds(old),
    ),
  );
  const deps = plan.replaceDependencies.includes(old.id)
    ? plan.dependencies.filter((d) => d.taskId === old.id).map((d) => d.dependsOnTaskId)
    : visibleDependencies(old);
  plan.dependencies.push(...depRows(s, id, deps));
  await copiedChildren(r, s, old, plan, id);
  plan.events.push(event(s, created, now, 'task.created', plan.ids));
}
export function completionBefore(t: TaskRow) {
  return {
    status: t.status,
    completedAt: nullableInstant(t.completedAt),
    previousStatus: t.previousStatus,
    updatedAt: instant(t.updatedAt),
  };
}
export function lifecycleBefore(t: TaskRow) {
  return {
    archivedAt: nullableInstant(t.archivedAt),
    deletedAt: nullableInstant(t.deletedAt),
    deletedBy: t.deletedBy,
    updatedAt: instant(t.updatedAt),
  };
}
export function undoPlan(
  s: WorkspaceContext,
  plan: Plan,
  kind: UndoDescriptor['kind'],
  column = false,
) {
  const descriptor: UndoDescriptor = { id: plan.ids(), kind };
  const targets: unknown[] = plan.changed.map((t) => {
    const old = plan.before.find((b) => b.id === t.id);
    if (!old) throw new ApiFailure('INTERNAL_ERROR', 'Missing task before state');
    return {
      id: t.id,
      postVersion: old.version + 1,
      ...(column ? { entity: 'parent' } : {}),
      before:
        kind === 'task.complete' || kind === 'tasks.completeColumn'
          ? completionBefore(old)
          : lifecycleBefore(old),
    };
  });
  if (column)
    targets.push(
      ...plan.created.map((t) => ({
        id: t.id,
        postVersion: 1,
        entity: 'successor',
        parentId: EntityIdSchema.parse(t.recurrenceSourceTaskId),
        children: plan.children
          .filter((c) => c.taskId === t.id)
          .map(({ workspaceId: _, taskId: __, ...c }) => {
            void _;
            void __;
            return { ...c, done: !!c.done };
          }),
        labelIds: plan.labels.filter((l) => l.taskId === t.id).map((l) => l.labelId),
        dependencyIds: plan.dependencies
          .filter((d) => d.taskId === t.id)
          .map((d) => d.dependsOnTaskId),
      })),
    );
  if (column)
    targets.push(
      ...(plan.dependencyTargets ?? []).map((t) => ({
        id: t.id,
        postVersion: t.version + 1,
        entity: 'dependency',
      })),
    );
  if (targets.length > 128)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Undo exceeds maxUndoTargets');
  const payload = encodeUndoPayload({
    kind,
    targets,
    ...(kind === 'tasks.archiveCompletedColumn' || kind === 'tasks.completeColumn'
      ? { columnScope: plan.intent.kind === 'column' ? plan.intent.scope : undefined }
      : {}),
    activityIds: plan.events.map((e) => e.id),
  });
  plan.undo = { descriptor, payload };
  void s;
}
export function conflict<T>(result: T | null): T {
  if (!result)
    throw new ApiFailure('CONFLICT', 'Task version, access, relations or command scope changed');
  return result;
}
export async function replay(
  r: RequestRepository,
  s: WorkspaceContext,
  requestId: string,
  hash: string,
  projectId: string,
) {
  const [old] = await requestTask(r, s, requestId);
  if (!old) return null;
  if (
    old.projectId !== projectId ||
    old.createRequestHash !== hash ||
    old.deletedAt !== null ||
    old.archivedAt !== null
  )
    throw new ApiFailure('CONFLICT', 'Create request intent or task lifecycle changed');
  const row = await taskRow(r, s, EntityIdSchema.parse(old.id));
  if (row.projectId !== projectId || row.archivedAt !== null || row.deletedAt !== null)
    throw new ApiFailure('CONFLICT', 'Created task moved scope or lifecycle changed');
  return {
    task: taskDto(row),
    createdTasks: [],
    affectedProjectIds: [EntityIdSchema.parse(row.projectId)],
    undo: null,
  };
}
export async function execute(r: RequestRepository, s: WorkspaceContext, plan: Plan, now: number) {
  const result = await executePlan(r, s, plan, now);
  return (
    result && {
      ...result,
      tasks: result.tasks.map(taskDto),
      createdTasks: result.createdTasks.map(taskDto),
    }
  );
}

function requireCreated(plan: Plan, id: string): TaskRow {
  const row = plan.created.find((t) => t.id === id);
  if (!row) throw new ApiFailure('INTERNAL_ERROR', 'Missing created task plan');
  return row;
}
