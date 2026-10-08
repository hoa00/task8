import { BulkMutateTasksInputSchema, CreateTaskInputSchema, UpdateSubtaskInputSchema, ActivitySchema, CursorPayloadSchema, EntityIdSchema, MoveTaskInputSchema, SetTaskCompletionInputSchema, TaskSchema, UpdateTaskInputSchema, UndoResultSchema } from '@studio/contracts/api';
import type { OperationId, TaskDto, TaskMutationDto } from '@studio/contracts/api';
import { changedDependencyTargets, canReadProject, compareTaskTuple, taskSortValue, evaluateTaskView, normalizeTaskView, nextRecurrenceDate, summarizeTasks, TaskRelationError, validateTaskRelations } from '@studio/domain';
import type { Clock } from '@studio/domain';
import { StudioApiError, unavailable } from '../errors.ts';
import type { MockDataset } from './dataset.ts';

export const taskFieldOperations = ['createTask', 'bulkMutateTasks', 'updateSubtask', 'getTask', 'listTasks', 'getTaskSummary', 'updateTask', 'moveTask', 'setTaskCompletion', 'undoCommand'] as const satisfies readonly OperationId[];
const fail = (code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR', message: string, field?: string): never => { throw new StudioApiError({ error: { code, message, ...(field ? { fieldErrors: { [field]: [message] } } : {}) } }); };
export function newMockId(clock: Clock) { const time = Date.parse(clock.now()).toString(16).padStart(12, '0'); const random = crypto.randomUUID(); return EntityIdSchema.parse(`${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`); }
function getTask(data: MockDataset, id: string): TaskDto {
  const task = data.tasks[EntityIdSchema.parse(id)];
  if (!task || data.taskCommands.deletedTasks[task.id] || task.workspaceId !== data.workspaceId || !canReadProject(data.projects[task.projectId], data)) return fail('NOT_FOUND', 'Task not found');
  return task;
}
function editable(data: MockDataset, id: string, version: number): TaskDto {
  const task = getTask(data, id);
  if (task.version !== version) return fail('CONFLICT', 'The task changed. Review the current values and try again.');
  if (task.archivedAt || data.projects[task.projectId]!.archivedAt) return fail('CONFLICT', 'Archived tasks cannot be edited');
  return task;
}
function projectTask(task: TaskDto, data: MockDataset): TaskDto {
  return { ...task, dependencyIds: task.dependencyIds.filter(id => { const target = data.tasks[id]; return !!target && !data.taskCommands.deletedTasks[id] && !target.archivedAt && canReadProject(data.projects[target.projectId], data) && !data.projects[target.projectId]!.archivedAt; }) };
}
function validate(task: TaskDto, data: MockDataset, explicitDependencies = false) {
  const parsed = TaskSchema.safeParse(task);
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Start date must be on or before due date', 'startDate');
  try { const activeTasks = Object.fromEntries(Object.entries(data.tasks).filter(([, row]) => !data.taskCommands.deletedTasks[row.id])); validateTaskRelations(explicitDependencies ? task : projectTask(task, data), { ...data, tasks: activeTasks }); } catch (error) { if (error instanceof TaskRelationError) return fail(error.reason === 'cycle' ? 'CONFLICT' : 'VALIDATION_ERROR', error.message, error.field); throw error; }
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
      const successor = TaskSchema.parse({ ...next, dependencyIds: projectTask(next, data).dependencyIds, id: newMockId(clock), key: allocateTaskKey(data, project.id), status: 'todo', completedAt: null, startDate: dueDate, dueDate, createdAt: clock.now(), updatedAt: clock.now(), version: 1, isFavorite: false, attachmentCount: 0, commentCount: 0, position: Math.max(0, ...Object.values(data.tasks).filter(task => task.projectId === project.id).map(task => task.position)) + 100, subtaskSummary: { ...next.subtaskSummary, completed: 0 } });
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
  validate(next, data, patch.dependencyIds !== undefined);
  const createdTasks = transition(data, original, next, clock);
  for (const id of new Set([...changedDependencyTargets(original.dependencyIds, next.dependencyIds), ...createdTasks.flatMap(task => task.dependencyIds)])) { const target = data.tasks[id]!; data.tasks[id] = { ...target, version: target.version + 1 }; }
  data.tasks[next.id] = next;
  const eventType = next.status !== original.status && next.status === 'done' ? 'task.completed' : next.projectId !== original.projectId ? 'task.moved' : next.assigneeId !== original.assigneeId ? 'task.assigned' : next.priority !== original.priority ? 'task.priorityChanged' : 'task.updated';
  const activity = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType, taskId: next.id, projectId: next.projectId, createdAt: clock.now(), payload: { taskKey: next.key, taskTitle: next.title, previousStatus: original.status, status: next.status, priority: next.priority, assigneeId: next.assigneeId } });
  data.activity[activity.id] = activity;
  for (const task of createdTasks) { const event = ActivitySchema.parse({ ...activity, id: newMockId(clock), eventType: 'task.created', taskId: task.id, payload: { taskKey: task.key, taskTitle: task.title } }); data.activity[event.id] = event; }
  return { task: projectTask(next, data), createdTasks: createdTasks.map(task => projectTask(task, data)), affectedProjectIds: [...new Set([original.projectId, next.projectId])], undo: null };
}
export async function fingerprint(query: object): Promise<string> { const bytes = new TextEncoder().encode(JSON.stringify(query)); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''); }
const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function executeTaskOperation(id: OperationId, input: Record<string, unknown>, data: MockDataset, clock: Clock): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'createTask': {
      const body = CreateTaskInputSchema.parse(input.body);
      if (body.descriptionHtml || body.subtasks.length) throw unavailable('Task form fields');
      const signature = await fingerprint(body), prior = data.taskCommands.createRequests[data.currentMemberId]?.[body.clientRequestId];
      if (prior) { if (prior.fingerprint !== signature) return fail('CONFLICT', 'Create request ID was reused with different values'); const task = getTask(data, prior.taskId); return { data: { task: projectTask(task, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: null } }; }
      const fields = Object.fromEntries(Object.entries(body).filter(([key]) => !['clientRequestId', 'subtasks'].includes(key)));
      const task = TaskSchema.parse({ ...fields, id: newMockId(clock), workspaceId: data.workspaceId, key: 'NEW-0', createdAt: clock.now(), updatedAt: clock.now(), completedAt: body.status === 'done' ? clock.now() : null, archivedAt: null, position: Math.max(0, ...Object.values(data.tasks).map(row => row.position)) + 100, version: 1, isFavorite: false, attachmentCount: 0, commentCount: 0, subtaskSummary: { total: 0, completed: 0 } });
      validate(task, data, true); task.key = allocateTaskKey(data, task.projectId); data.tasks[task.id] = task;
      for (const targetId of task.dependencyIds) data.tasks[targetId] = { ...data.tasks[targetId]!, version: data.tasks[targetId]!.version + 1 };
      const event = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType: 'task.created', taskId: task.id, projectId: task.projectId, createdAt: clock.now(), payload: { taskKey: task.key, taskTitle: task.title } }); data.activity[event.id] = event;
      const requests = data.taskCommands.createRequests[data.currentMemberId] ?? {}; requests[body.clientRequestId] = { fingerprint: signature, taskId: task.id }; data.taskCommands.createRequests[data.currentMemberId] = requests;
      return { data: { task: projectTask(task, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: null } };
    }
    case 'updateSubtask': {
      const body = UpdateSubtaskInputSchema.parse(input.body), task = editable(data, taskId, body.expectedTaskVersion);
      if (Object.keys(body).some(key => !['expectedTaskVersion', 'done'].includes(key))) throw unavailable('Subtask detail editing');
      const subtaskId = EntityIdSchema.parse(input.subtaskId), subtask = data.subtasks[subtaskId];
      if (!subtask || subtask.taskId !== task.id) return fail('NOT_FOUND', 'Subtask not found');
      data.subtasks[subtaskId] = { ...subtask, done: body.done ?? subtask.done };
      const subtasks = Object.values(data.subtasks).filter(row => row.taskId === task.id);
      data.tasks[task.id] = { ...task, version: task.version + 1, updatedAt: clock.now(), subtaskSummary: { total: subtasks.length, completed: subtasks.filter(row => row.done).length } };
      return { data: { task: projectTask(data.tasks[task.id]!, data), subtasks, attachments: Object.values(data.files).filter(row => row.taskId === task.id) } };
    }
    case 'bulkMutateTasks': {
      const body = BulkMutateTasksInputSchema.parse(input.body);
      if (body.operation !== 'patch' && body.operation !== 'delete') throw unavailable('Column commands');
      const originals = body.items.map(item => editable(data, item.id, item.expectedVersion));
      if (body.operation === 'patch') {
        // Validate every prospective aggregate before transition/recurrence writes.
        for (const task of originals) validate({ ...task, ...definedPatch(body.patch), completedAt: body.patch.status ? body.patch.status === 'done' ? clock.now() : null : task.completedAt }, data);
        const results = originals.map(task => patchTask(data, data.tasks[task.id]!, definedPatch(body.patch), clock));
        return { data: { tasks: results.map(row => projectTask(data.tasks[row.task.id]!, data)), createdTasks: results.flatMap(row => row.createdTasks).map(task => projectTask(data.tasks[task.id]!, data)), affectedProjectIds: [...new Set(results.flatMap(row => row.affectedProjectIds))], undo: null } };
      }
      const undoId = newMockId(clock), deletedAt = clock.now(), activityIds: TaskDto['id'][] = [];
      const tasks = originals.map(task => { const next = { ...task, version: task.version + 1, updatedAt: clock.now() }; data.tasks[task.id] = next; data.taskCommands.deletedTasks[task.id] = deletedAt;
        const event = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType: 'task.deleted', taskId: task.id, projectId: task.projectId, createdAt: clock.now(), payload: { taskKey: task.key, taskTitle: task.title } }); data.activity[event.id] = event; activityIds.push(event.id); return next; });
      data.taskCommands.deleteUndoRecords[undoId] = { actorId: data.currentMemberId, targets: tasks.map(task => ({ taskId: task.id, postVersion: task.version, deletedAt })), activityIds, result: null };
      return { data: { tasks: tasks.map(task => projectTask(task, data)), createdTasks: [], affectedProjectIds: [...new Set(tasks.map(task => task.projectId))], undo: { id: undoId, kind: 'tasks.bulkDelete' } } };
    }
    case 'getTask': { const task = getTask(data, taskId); return { data: { task: projectTask(task, data), subtasks: Object.values(data.subtasks).filter(row => row.taskId === task.id), attachments: Object.values(data.files).filter(row => row.taskId === task.id) } }; }
    case 'listTasks': case 'getTaskSummary': {
      const query = normalizeTaskView({ query: input.query }).query, { cursor, limit, ...scope } = query;
      const available = Object.values(data.tasks).filter(task => task.workspaceId === data.workspaceId && !data.taskCommands.deletedTasks[task.id] && canReadProject(data.projects[task.projectId], data) && !data.projects[task.projectId]!.archivedAt);
      const env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: Object.values(data.members), projects: Object.values(data.projects).filter(project => canReadProject(project, data)) } };
      const view = evaluateTaskView(available, normalizeTaskView({ query }), env), tasks = view.taskIds.map(value => data.tasks[value]!);
      if (id === 'getTaskSummary') return { data: summarizeTasks(tasks, clock.today()) };
      const queryFingerprint = await fingerprint(scope); let start = 0;
      if (cursor) {
        try { const decoded = CursorPayloadSchema.parse(JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')))); if (decoded.queryFingerprint !== queryFingerprint || decoded.sortField !== query.sortField || decoded.sortDirection !== query.sortDirection) return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor'); const index = tasks.findIndex(task => compareTaskTuple({ value: taskSortValue(task, query.sortField, env.lookups), id: task.id }, { value: decoded.sortValue, id: decoded.id }, query.sortDirection) > 0); start = index < 0 ? tasks.length : index; } catch (error) { if (error instanceof StudioApiError) throw error; return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor'); }
      }
      const items = tasks.slice(start, start + limit).map(task => projectTask(task, data)), last = items.at(-1);
      return { data: { items, total: tasks.length, nextCursor: last && start + items.length < tasks.length ? encode({ formatVersion: 1, queryFingerprint, sortField: query.sortField, sortDirection: query.sortDirection, sortValue: taskSortValue(last, query.sortField, env.lookups), id: last.id }) : null } };
    }
    case 'updateTask': { const { expectedVersion, ...patch } = UpdateTaskInputSchema.parse(input.body); if (patch.descriptionHtml !== undefined) throw unavailable('Task text editing'); const task = editable(data, taskId, expectedVersion); return { data: patchTask(data, task, definedPatch(patch), clock) }; }
    case 'moveTask': {
      const body = MoveTaskInputSchema.parse(input.body), task = editable(data, taskId, body.expectedVersion);
      const projectId = body.targetProjectId ?? task.projectId;
      const groupPatch = definedPatch(body.groupPatch ?? {});
      const prospective = { ...task, ...groupPatch, projectId }; validate(prospective.status !== task.status ? { ...prospective, completedAt: prospective.status === 'done' ? clock.now() : null } : prospective, data);
      const env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: Object.values(data.members), projects: Object.values(data.projects) } };
      const { groupBy, groupKey, ...scope } = body.scope;
      const destination = evaluateTaskView(Object.values(data.tasks).filter(row => row.id !== task.id && !data.taskCommands.deletedTasks[row.id] && !row.archivedAt && !data.projects[row.projectId]?.archivedAt && canReadProject(data.projects[row.projectId], data)), normalizeTaskView({ query: { ...scope, ...(body.targetProjectId ? { projectId } : {}), sortField: 'manual', sortDirection: 'asc' }, groupBy: groupBy ?? 'none' }), env);
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
      if ((task.status === 'done') === body.completed) return { data: { task: projectTask(task, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: null } };
      const status = body.completed ? 'done' : data.taskCommands.previousStatuses[task.id] ?? 'todo';
      const result = patchTask(data, task, { status: status === 'done' && !body.completed ? 'todo' : status }, clock);
      if (body.completed) {
        const undoId = newMockId(clock); data.taskCommands.undoRecords[undoId] = { taskId: task.id, actorId: data.currentMemberId, postVersion: result.task.version, previousStatus: task.status, result: null }; result.undo = { id: undoId, kind: 'task.complete' };
      }
      return { data: result };
    }
    case 'undoCommand': {
      const undoId = EntityIdSchema.parse(input.undoId), deleted = data.taskCommands.deleteUndoRecords[undoId];
      if (deleted) {
        if (deleted.actorId !== data.currentMemberId) return fail('NOT_FOUND', 'Undo command not found');
        const tasks = deleted.targets.map(target => { const task = data.tasks[target.taskId]; if (!task || !canReadProject(data.projects[task.projectId], data)) return fail('NOT_FOUND', 'Task not found'); return task; });
        if (deleted.result) return { data: deleted.result };
        deleted.targets.forEach((target, index) => { const task = tasks[index]!; if (task.version !== target.postVersion || data.taskCommands.deletedTasks[task.id] !== target.deletedAt || task.archivedAt || data.projects[task.projectId]!.archivedAt) return fail('CONFLICT', 'A deleted task changed. No tasks were restored.'); });
        tasks.forEach(task => { delete data.taskCommands.deletedTasks[task.id]; data.tasks[task.id] = { ...task, version: task.version + 1 }; });
        deleted.activityIds.forEach(id => { delete data.activity[id]; });
        deleted.result = UndoResultSchema.parse({ undoId, kind: 'tasks.bulkDelete', appliedAt: clock.now(), affected: { taskIds: tasks.map(task => task.id), projectIds: [...new Set(tasks.map(task => task.projectId))], memberIds: [], teamIds: [], commentIds: [], fileIds: [] } }); return { data: deleted.result };
      }
      const record = data.taskCommands.undoRecords[undoId];
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

// Stage a command on an isolated aggregate; only a successful command commits.
// This is a transaction boundary, never an Undo workspace snapshot.
const commands = new WeakMap<MockDataset, Promise<unknown>>();
export async function runTaskFieldOperation(id: OperationId, input: Record<string, unknown>, data: MockDataset, clock: Clock): Promise<unknown> {
  if (['getTask', 'listTasks', 'getTaskSummary'].includes(id)) return executeTaskOperation(id, input, data, clock);
  const previous = commands.get(data) ?? Promise.resolve();
  const command = previous.catch(() => {}).then(async () => { const staged = structuredClone(data); const result = await executeTaskOperation(id, input, staged, clock); Object.assign(data, staged); return result; });
  commands.set(data, command); try { return await command; } finally { if (commands.get(data) === command) commands.delete(data); }
}
