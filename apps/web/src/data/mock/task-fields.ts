import { ActivitySchema, CursorPayloadSchema, EntityIdSchema, MoveTaskInputSchema, SetTaskCompletionInputSchema, TaskSchema, UpdateTaskInputSchema, UndoResultSchema } from '@studio/contracts/api';
import type { OperationId, TaskDto, TaskMutationDto } from '@studio/contracts/api';
import { changedDependencyTargets, canReadProject, compareTaskTuple, taskSortValue, evaluateTaskView, normalizeTaskView, nextRecurrenceDate, summarizeTasks, TaskRelationError, validateTaskRelations } from '@studio/domain';
import type { Clock } from '@studio/domain';
import { StudioApiError, unavailable } from '../errors.ts';
import type { MockDataset } from './dataset.ts';

export const taskFieldOperations = ['getTask', 'listTasks', 'getTaskSummary', 'updateTask', 'moveTask', 'setTaskCompletion', 'undoCommand'] as const satisfies readonly OperationId[];
const fail = (code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR', message: string, field?: string): never => { throw new StudioApiError({ error: { code, message, ...(field ? { fieldErrors: { [field]: [message] } } : {}) } }); };
export function newMockId(clock: Clock) { const time = Date.parse(clock.now()).toString(16).padStart(12, '0'); const random = crypto.randomUUID(); return EntityIdSchema.parse(`${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`); }
function getTask(data: MockDataset, id: string): TaskDto {
  const task = data.tasks[EntityIdSchema.parse(id)];
  if (!task || task.workspaceId !== data.workspaceId || !canReadProject(data.projects[task.projectId], data)) return fail('NOT_FOUND', 'Task not found');
  return task;
}
function editable(data: MockDataset, id: string, version: number): TaskDto {
  const task = getTask(data, id);
  if (task.version !== version) return fail('CONFLICT', 'The task changed. Review the current values and try again.');
  if (task.archivedAt || data.projects[task.projectId]!.archivedAt) return fail('CONFLICT', 'Archived tasks cannot be edited');
  return task;
}
function validate(task: TaskDto, data: MockDataset) {
  const parsed = TaskSchema.safeParse(task);
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Start date must be on or before due date', 'startDate');
  try { validateTaskRelations(task, data); } catch (error) { if (error instanceof TaskRelationError) return fail(error.reason === 'cycle' ? 'CONFLICT' : 'VALIDATION_ERROR', error.message, error.field); throw error; }
}
function allocateTaskKey(data: MockDataset, projectId: TaskDto['projectId']): string {
  const number = (data.taskCommands.projectSequences[projectId] ?? Math.max(200, ...Object.values(data.tasks).filter(task => task.projectId === projectId).map(task => Number(task.key.split('-').at(-1))))) + 1;
  data.taskCommands.projectSequences[projectId] = number;
  return `${data.projects[projectId]!.key}-${number}`;
}
function transition(data: MockDataset, original: TaskDto, next: TaskDto, clock: Clock): TaskDto[] {
  const created: TaskDto[] = [];
  if (original.status === next.status) return created;
  next.completedAt = next.status === 'done' ? clock.now() : null;
  if (next.status === 'done') {
    data.taskCommands.previousStatuses[original.id] = original.status;
    if (next.recurrence && next.dueDate && !data.taskCommands.recurrenceSlots[original.id]) {
      const dueDate = nextRecurrenceDate(next.dueDate, next.recurrence), project = data.projects[next.projectId]!;
      const successor = TaskSchema.parse({ ...next, id: newMockId(clock), key: allocateTaskKey(data, project.id), status: 'todo', completedAt: null, startDate: dueDate, dueDate, createdAt: clock.now(), updatedAt: clock.now(), version: 1, isFavorite: false, attachmentCount: 0, commentCount: 0, position: Math.max(0, ...Object.values(data.tasks).filter(task => task.projectId === project.id).map(task => task.position)) + 100, subtaskSummary: { ...next.subtaskSummary, completed: 0 } });
      const subtasks = Object.values(data.subtasks).filter(row => row.taskId === original.id).map(row => ({ ...row, id: newMockId(clock), taskId: successor.id, done: false }));
      data.tasks[successor.id] = successor; subtasks.forEach(row => { data.subtasks[row.id] = row; });
      data.taskCommands.recurrenceSlots[original.id] = successor.id; created.push(successor);
    }
  }
  return created;
}
function definedPatch(value: object): Partial<TaskDto> { return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<TaskDto>; }
function patchTask(data: MockDataset, original: TaskDto, patch: Partial<TaskDto>, clock: Clock): TaskMutationDto {
  const next = { ...original, ...patch, updatedAt: clock.now(), version: original.version + 1 };
  // Validate the prospective status/completedAt pair before any write.
  if (next.status !== original.status) next.completedAt = next.status === 'done' ? clock.now() : null;
  validate(next, data);
  const createdTasks = transition(data, original, next, clock);
  for (const id of new Set([...changedDependencyTargets(original.dependencyIds, next.dependencyIds), ...createdTasks.flatMap(task => task.dependencyIds)])) { const target = data.tasks[id]!; data.tasks[id] = { ...target, version: target.version + 1 }; }
  data.tasks[next.id] = next;
  const eventType = next.status !== original.status && next.status === 'done' ? 'task.completed' : next.projectId !== original.projectId ? 'task.moved' : next.assigneeId !== original.assigneeId ? 'task.assigned' : next.priority !== original.priority ? 'task.priorityChanged' : 'task.updated';
  const activity = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType, taskId: next.id, projectId: next.projectId, createdAt: clock.now(), payload: { taskKey: next.key, taskTitle: next.title, previousStatus: original.status, status: next.status, priority: next.priority, assigneeId: next.assigneeId } });
  data.activity[activity.id] = activity;
  for (const task of createdTasks) { const event = ActivitySchema.parse({ ...activity, id: newMockId(clock), eventType: 'task.created', taskId: task.id, payload: { taskKey: task.key, taskTitle: task.title } }); data.activity[event.id] = event; }
  return { task: next, createdTasks, affectedProjectIds: [...new Set([original.projectId, next.projectId])], undo: null };
}
async function fingerprint(query: object): Promise<string> { const bytes = new TextEncoder().encode(JSON.stringify(query)); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''); }
const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export async function runTaskFieldOperation(id: OperationId, input: Record<string, unknown>, data: MockDataset, clock: Clock): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'getTask': { const task = getTask(data, taskId); return { data: { task, subtasks: Object.values(data.subtasks).filter(row => row.taskId === task.id), attachments: Object.values(data.files).filter(row => row.taskId === task.id) } }; }
    case 'listTasks': case 'getTaskSummary': {
      const query = normalizeTaskView({ query: input.query }).query, { cursor, limit, ...scope } = query;
      const available = Object.values(data.tasks).filter(task => task.workspaceId === data.workspaceId && canReadProject(data.projects[task.projectId], data) && !data.projects[task.projectId]!.archivedAt);
      const env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: Object.values(data.members), projects: Object.values(data.projects).filter(project => canReadProject(project, data)) } };
      const view = evaluateTaskView(available, normalizeTaskView({ query }), env), tasks = view.taskIds.map(value => data.tasks[value]!);
      if (id === 'getTaskSummary') return { data: summarizeTasks(tasks, clock.today()) };
      const queryFingerprint = await fingerprint(scope); let start = 0;
      if (cursor) {
        try { const decoded = CursorPayloadSchema.parse(JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')))); if (decoded.queryFingerprint !== queryFingerprint || decoded.sortField !== query.sortField || decoded.sortDirection !== query.sortDirection) return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor'); const index = tasks.findIndex(task => compareTaskTuple({ value: taskSortValue(task, query.sortField, env.lookups), id: task.id }, { value: decoded.sortValue, id: decoded.id }, query.sortDirection) > 0); start = index < 0 ? tasks.length : index; } catch (error) { if (error instanceof StudioApiError) throw error; return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor'); }
      }
      const items = tasks.slice(start, start + limit), last = items.at(-1);
      return { data: { items, total: tasks.length, nextCursor: last && start + items.length < tasks.length ? encode({ formatVersion: 1, queryFingerprint, sortField: query.sortField, sortDirection: query.sortDirection, sortValue: taskSortValue(last, query.sortField, env.lookups), id: last.id }) : null } };
    }
    case 'updateTask': { const { expectedVersion, ...patch } = UpdateTaskInputSchema.parse(input.body); if (patch.title !== undefined || patch.descriptionHtml !== undefined) throw unavailable('Task text editing'); const task = editable(data, taskId, expectedVersion); return { data: patchTask(data, task, definedPatch(patch), clock) }; }
    case 'moveTask': {
      const body = MoveTaskInputSchema.parse(input.body), task = editable(data, taskId, body.expectedVersion);
      const projectId = body.targetProjectId ?? task.projectId;
      const groupPatch = definedPatch(body.groupPatch ?? {});
      const prospective = { ...task, ...groupPatch, projectId }; validate(prospective.status !== task.status ? { ...prospective, completedAt: prospective.status === 'done' ? clock.now() : null } : prospective, data);
      const env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: Object.values(data.members), projects: Object.values(data.projects) } };
      const { groupBy, groupKey, ...scope } = body.scope;
      const destination = evaluateTaskView(Object.values(data.tasks).filter(row => row.id !== task.id && row.projectId === projectId && canReadProject(data.projects[row.projectId], data)), normalizeTaskView({ query: { ...scope, projectId }, groupBy: groupBy ?? 'none' }), env);
      const ids = groupBy && groupKey !== undefined ? destination.groups.find(group => group.key === (groupKey ?? 'none'))?.taskIds ?? [] : destination.taskIds;
      const before = body.beforeId ? data.tasks[body.beforeId] : null, after = body.afterId ? data.tasks[body.afterId] : null;
      for (const neighbor of [body.beforeId, body.afterId]) if (neighbor && !ids.includes(EntityIdSchema.parse(neighbor))) return fail('VALIDATION_ERROR', 'Move neighbor is outside the destination scope');
      if (before && after && after.position >= before.position) return fail('VALIDATION_ERROR', 'Move neighbors are not ordered');
      const position = before && after ? Math.floor((before.position + after.position) / 2) : before ? before.position - 100 : after ? after.position + 100 : Math.max(0, ...ids.map(value => data.tasks[value]!.position)) + 100;
      if (before && after && position === after.position) return fail('CONFLICT', 'No ordering space remains between these tasks');
      const key = projectId === task.projectId ? task.key : allocateTaskKey(data, projectId);
      const result = patchTask(data, task, { ...groupPatch, projectId, key, position }, clock);
      if (projectId !== task.projectId) Object.values(data.files).filter(file => file.taskId === task.id).forEach(file => { file.projectId = projectId; file.version++; });
      return { data: result };
    }
    case 'setTaskCompletion': {
      const body = SetTaskCompletionInputSchema.parse(input.body), task = editable(data, taskId, body.expectedVersion);
      if ((task.status === 'done') === body.completed) return { data: { task, createdTasks: [], affectedProjectIds: [task.projectId], undo: null } };
      const status = body.completed ? 'done' : data.taskCommands.previousStatuses[task.id] ?? 'todo';
      const result = patchTask(data, task, { status: status === 'done' && !body.completed ? 'todo' : status }, clock);
      if (body.completed) {
        const undoId = newMockId(clock); data.taskCommands.undoRecords[undoId] = { taskId: task.id, actorId: data.currentMemberId, postVersion: result.task.version, previousStatus: task.status, result: null }; result.undo = { id: undoId, kind: 'task.complete' };
      }
      return { data: result };
    }
    case 'undoCommand': {
      const undoId = EntityIdSchema.parse(input.undoId), record = data.taskCommands.undoRecords[undoId];
      if (!record || record.actorId !== data.currentMemberId) return fail('NOT_FOUND', 'Undo command not found');
      const task = getTask(data, record.taskId);
      if (record.result) return { data: record.result };
      editable(data, task.id, record.postVersion);
      patchTask(data, task, { status: record.previousStatus === 'done' ? 'todo' : record.previousStatus }, clock);
      record.result = UndoResultSchema.parse({ undoId, kind: 'task.complete', appliedAt: clock.now(), affected: { taskIds: [task.id], projectIds: [task.projectId], memberIds: [], teamIds: [], commentIds: [], fileIds: [] } });
      return { data: record.result };
    }
    default: throw new TypeError('Unsupported task-field operation');
  }
}
