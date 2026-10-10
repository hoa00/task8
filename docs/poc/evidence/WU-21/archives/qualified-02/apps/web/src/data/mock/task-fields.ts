import { BulkMutateTasksInputSchema, CreateTaskInputSchema, UpdateSubtaskInputSchema, ActivitySchema, CursorPayloadSchema, EntityIdSchema, MoveTaskInputSchema, SetTaskCompletionInputSchema, TaskSchema, UpdateTaskInputSchema, UndoResultSchema, SubtaskSchema, DuplicateTaskInputSchema, VersionInputSchema, FileSchema, UploadProjectFileInputSchema, priorities, CreateSubtaskInputSchema, TaskVersionInputSchema, CreateCommentInputSchema, CommentSchema, ReactionKeySchema, CursorQuerySchema, ActivityQuerySchema, MemberQuerySchema } from '@studio/contracts/api';
import type { OperationId, TaskDto, TaskMutationDto } from '@studio/contracts/api';
import { changedDependencyTargets, compareTaskTuple, taskSortValue, evaluateTaskView, normalizeTaskView, nextRecurrenceDate, summarizeTasks, TaskRelationError, validateTaskRelations, normalizeDescription, plainDescriptionHtml, sourceFileType, displayFileSize } from '@studio/domain';
import { canReadMockProject as canReadProject } from './project-access.ts';
import { transactMock } from './transaction.ts';
import type { Clock } from '@studio/domain';
import { StudioApiError } from '../errors.ts';
import type { MockDataset } from './dataset.ts';

export const taskFieldOperations = ['createTask', 'bulkMutateTasks', 'updateSubtask', 'createSubtask', 'deleteSubtask', 'promoteSubtask', 'listComments', 'createComment', 'deleteComment', 'restoreDeletedComment', 'addCommentReaction', 'removeCommentReaction', 'listActivity', 'listMembers', 'getTask', 'listTasks', 'getTaskSummary', 'updateTask', 'moveTask', 'setTaskCompletion', 'undoCommand', 'duplicateTask', 'archiveTask', 'deleteTask', 'addTaskFavorite', 'removeTaskFavorite', 'getFile', 'uploadProjectFile', 'deleteFile'] as const satisfies readonly OperationId[];
const fail = (code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'PAYLOAD_TOO_LARGE', message: string, field?: string): never => { throw new StudioApiError({ error: { code, message, ...(field ? { fieldErrors: { [field]: [message] } } : {}) } }); };
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
export function projectTask(task: TaskDto, data: MockDataset): TaskDto {
  return { ...task, isFavorite: (data.taskCommands.taskFavorites[data.currentMemberId] ?? []).includes(task.id), dependencyIds: task.dependencyIds.filter(id => { const target = data.tasks[id]; return !!target && !data.taskCommands.deletedTasks[id] && !target.archivedAt && canReadProject(data.projects[target.projectId], data) && !data.projects[target.projectId]!.archivedAt; }) };
}
function validate(task: TaskDto, data: MockDataset, explicitDependencies = false) {
  const parsed = TaskSchema.safeParse(task);
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Start date must be on or before due date', 'startDate');
  try { const activeProjects = Object.fromEntries(Object.entries(data.projects).filter(([, row]) => !data.projectCommands.deletedProjects[row.id])); const activeTasks = Object.fromEntries(Object.entries(data.tasks).filter(([, row]) => !data.taskCommands.deletedTasks[row.id] && !!activeProjects[row.projectId])); validateTaskRelations(explicitDependencies ? task : projectTask(task, data), { ...data, projects: activeProjects, tasks: activeTasks }); } catch (error) { if (error instanceof TaskRelationError) return fail(error.reason === 'cycle' ? 'CONFLICT' : 'VALIDATION_ERROR', error.message, error.field); throw error; }
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
      data.tasks[successor.id] = successor; data.taskCommands.descriptionTexts[successor.id] = normalizeDescription(successor.descriptionHtml).text; subtasks.forEach(row => { data.subtasks[row.id] = row; });
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
  if (patch.descriptionHtml !== undefined) data.taskCommands.descriptionTexts[next.id] = normalizeDescription(next.descriptionHtml).text;
  const eventType = next.status !== original.status && next.status === 'done' ? 'task.completed' : next.projectId !== original.projectId ? 'task.moved' : next.assigneeId !== original.assigneeId ? 'task.assigned' : next.priority !== original.priority ? 'task.priorityChanged' : 'task.updated';
  const activity = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType, taskId: next.id, projectId: next.projectId, createdAt: clock.now(), payload: { taskKey: next.key, taskTitle: next.title, previousStatus: original.status, status: next.status, priority: next.priority, assigneeId: next.assigneeId } });
  data.activity[activity.id] = activity;
  for (const task of createdTasks) { const event = ActivitySchema.parse({ ...activity, id: newMockId(clock), eventType: 'task.created', taskId: task.id, payload: { taskKey: task.key, taskTitle: task.title } }); data.activity[event.id] = event; }
  return { task: projectTask(next, data), createdTasks: createdTasks.map(task => projectTask(task, data)), affectedProjectIds: [...new Set([original.projectId, next.projectId])], undo: null };
}
function addActivity(data: MockDataset, task: TaskDto, eventType: string, clock: Clock, detail?: string): TaskDto['id'] {
  const event = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType, taskId: task.id, projectId: task.projectId, createdAt: clock.now(), payload: { taskKey: task.key, taskTitle: task.title, ...(detail ? { detail } : {}) } }); data.activity[event.id] = event; return event.id;
}
function accessibleFile(data: MockDataset, id: string) {
  const file = data.files[EntityIdSchema.parse(id)];
  if (!file || data.taskCommands.deletedFiles[file.id] || !canReadProject(data.projects[file.projectId], data) || data.projects[file.projectId]!.archivedAt || (file.taskId && (data.taskCommands.deletedTasks[file.taskId] || data.tasks[file.taskId]?.archivedAt))) return fail('NOT_FOUND', 'File not found');
  return file;
}
function touchAttachments(data: MockDataset, task: TaskDto, clock: Clock) { data.tasks[task.id] = { ...task, version: task.version + 1, updatedAt: clock.now(), attachmentCount: Object.values(data.files).filter(file => file.taskId === task.id && !data.taskCommands.deletedFiles[file.id]).length }; }
function undoLifecycle(data: MockDataset, undoId: string, record: MockDataset['taskCommands']['lifecycleUndoRecords'][TaskDto['id']], clock: Clock) {
  if (record.actorId !== data.currentMemberId) return fail('NOT_FOUND', 'Undo command not found');
  const file = record.kind === 'file.delete' ? data.files[record.entityId] : null, task = record.kind === 'file.delete' ? record.taskId ? data.tasks[record.taskId] : null : data.tasks[record.entityId];
  const projectId = file?.projectId ?? task?.projectId;
  if (!projectId || !canReadProject(data.projects[projectId], data)) return fail('NOT_FOUND', 'Undo target not found');
  if (record.result) return record.result;
  if (data.projects[projectId]!.archivedAt) return fail('CONFLICT', 'The project changed. Undo cannot be applied.');
  if (record.kind === 'file.delete') {
    if (!file || file.version !== record.postVersion || data.taskCommands.deletedFiles[file.id] !== record.lifecycleAt || (record.taskId && (!task || task.version !== record.taskPostVersion || task.archivedAt || data.taskCommands.deletedTasks[task.id] || task.projectId !== file.projectId))) return fail('CONFLICT', 'The file or attached task changed. Undo cannot be applied.');
    delete data.taskCommands.deletedFiles[file.id]; data.files[file.id] = { ...file, version: file.version + 1 }; if (task) touchAttachments(data, task, clock);
  } else {
    if (!task || task.version !== record.postVersion || (record.kind === 'task.archive' ? task.archivedAt !== record.lifecycleAt || !!data.taskCommands.deletedTasks[task.id] : data.taskCommands.deletedTasks[task.id] !== record.lifecycleAt || task.archivedAt !== record.previousArchivedAt)) return fail('CONFLICT', 'The task changed. Undo cannot be applied.');
    if (record.kind === 'task.delete') delete data.taskCommands.deletedTasks[task.id];
    data.tasks[task.id] = { ...task, archivedAt: record.previousArchivedAt, version: task.version + 1 };
  }
  record.activityIds.forEach(id => { delete data.activity[id]; });
  record.result = UndoResultSchema.parse({ undoId, kind: record.kind, appliedAt: clock.now(), affected: { taskIds: task ? [task.id] : [], projectIds: [projectId], memberIds: [], teamIds: [], commentIds: [], fileIds: file ? [file.id] : [] } }); return record.result;
}
export async function fingerprint(query: object): Promise<string> { const bytes = new TextEncoder().encode(JSON.stringify(query)); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''); }
const encode = (data: unknown) => btoa(JSON.stringify(data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function detailOf(data: MockDataset, task: TaskDto) { return { task: projectTask(task, data), subtasks: Object.values(data.subtasks).filter(row => row.taskId === task.id).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)), attachments: Object.values(data.files).filter(row => row.taskId === task.id && !data.taskCommands.deletedFiles[row.id]) }; }
function touchChildren(data: MockDataset, task: TaskDto, clock: Clock) { const rows = Object.values(data.subtasks).filter(row => row.taskId === task.id); data.tasks[task.id] = { ...task, version: task.version + 1, updatedAt: clock.now(), subtaskSummary: { total: rows.length, completed: rows.filter(row => row.done).length } }; }
function touchComments(data: MockDataset, task: TaskDto, clock: Clock) { data.tasks[task.id] = { ...task, version: task.version + 1, updatedAt: clock.now(), commentCount: Object.values(data.comments).filter(row => row.taskId === task.id && !data.taskCommands.deletedComments[row.id]).length }; }
function commentOf(data: MockDataset, id: string, includeDeleted = false) { const comment = data.comments[EntityIdSchema.parse(id)]; if (!comment || (!includeDeleted && data.taskCommands.deletedComments[comment.id])) return fail('NOT_FOUND', 'Comment not found'); getTask(data, comment.taskId); return comment; }
async function cursorPage<T extends { id: string; createdAt?: string }>(rows: T[], query: { cursor?: string | undefined; limit: number }, scope: object, descending: boolean) {
  const signature = await fingerprint(scope); let start = 0;
  if (query.cursor) {
    try { const value = JSON.parse(atob(query.cursor.replaceAll('-', '+').replaceAll('_', '/'))) as { signature: string; id: string; at: string }; if (value.signature !== signature || typeof value.id !== 'string' || typeof value.at !== 'string') return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor'); const index = rows.findIndex(row => { const order = (row.createdAt ?? '').localeCompare(value.at) || row.id.localeCompare(value.id); return descending ? order < 0 : order > 0; }); start = index < 0 ? rows.length : index; } catch { return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor'); }
  }
  const items = rows.slice(start, start + query.limit), last = items.at(-1); return { items, total: rows.length, nextCursor: last && start + items.length < rows.length ? encode({ signature, id: last.id, at: last.createdAt ?? '' }) : null };
}
async function executeTaskOperation(id: OperationId, input: Record<string, unknown>, data: MockDataset, clock: Clock): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'createTask': {
      const body = CreateTaskInputSchema.parse(input.body);
      const normalized = normalizeDescription(body.descriptionHtml); body.descriptionHtml = normalized.html;
      for (const child of body.subtasks) if (child.assigneeId && (!data.members[child.assigneeId] || data.members[child.assigneeId]!.workspaceId !== data.workspaceId)) return fail('VALIDATION_ERROR', 'Choose a member in this workspace', 'subtasks');
      const signature = await fingerprint(body), prior = data.taskCommands.createRequests[data.currentMemberId]?.[body.clientRequestId];
      if (prior) { if (prior.fingerprint !== signature) return fail('CONFLICT', 'Create request ID was reused with different values'); const task = getTask(data, prior.taskId); return { data: { task: projectTask(task, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: null } }; }
      const fields = Object.fromEntries(Object.entries(body).filter(([key]) => !['clientRequestId', 'subtasks'].includes(key)));
      const task = TaskSchema.parse({ ...fields, id: newMockId(clock), workspaceId: data.workspaceId, key: 'NEW-0', createdAt: clock.now(), updatedAt: clock.now(), completedAt: body.status === 'done' ? clock.now() : null, archivedAt: null, position: Math.max(0, ...Object.values(data.tasks).map(row => row.position)) + 100, version: 1, isFavorite: false, attachmentCount: 0, commentCount: 0, subtaskSummary: { total: body.subtasks.length, completed: body.subtasks.filter(row => row.done).length } });
      validate(task, data, true); task.key = allocateTaskKey(data, task.projectId); data.tasks[task.id] = task;
      data.taskCommands.descriptionTexts[task.id] = normalized.text;
      body.subtasks.forEach((draft, index) => { const row = SubtaskSchema.parse({ ...draft, id: newMockId(clock), taskId: task.id, position: index * 100 }); data.subtasks[row.id] = row; });
      for (const targetId of task.dependencyIds) data.tasks[targetId] = { ...data.tasks[targetId]!, version: data.tasks[targetId]!.version + 1 };
      const event = ActivitySchema.parse({ id: newMockId(clock), actorId: data.currentMemberId, eventType: 'task.created', taskId: task.id, projectId: task.projectId, createdAt: clock.now(), payload: { taskKey: task.key, taskTitle: task.title } }); data.activity[event.id] = event;
      const requests = data.taskCommands.createRequests[data.currentMemberId] ?? {}; requests[body.clientRequestId] = { fingerprint: signature, taskId: task.id }; data.taskCommands.createRequests[data.currentMemberId] = requests;
      return { data: { task: projectTask(task, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: null } };
    }
    case 'duplicateTask': {
      const body = DuplicateTaskInputSchema.parse(input.body), original = editable(data, taskId, body.expectedVersion);
      const task = TaskSchema.parse({ ...original, id: newMockId(clock), key: allocateTaskKey(data, original.projectId), title: body.title ?? `${original.title} (copy)`, status: 'todo', completedAt: null, archivedAt: null, version: 1, isFavorite: false, attachmentCount: 0, commentCount: 0, createdAt: clock.now(), updatedAt: clock.now(), position: Math.max(0, ...Object.values(data.tasks).map(row => row.position)) + 100, dependencyIds: projectTask(original, data).dependencyIds, subtaskSummary: { ...original.subtaskSummary, completed: 0 } });
      validate(task, data, true); data.tasks[task.id] = task; data.taskCommands.descriptionTexts[task.id] = normalizeDescription(task.descriptionHtml).text;
      Object.values(data.subtasks).filter(row => row.taskId === original.id).forEach(row => { const child = { ...row, id: newMockId(clock), taskId: task.id, done: false }; data.subtasks[child.id] = child; });
      task.dependencyIds.forEach(id => { data.tasks[id] = { ...data.tasks[id]!, version: data.tasks[id]!.version + 1 }; });
      addActivity(data, task, 'task.created', clock);
      return { data: { task: projectTask(task, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: null } };
    }
    case 'addTaskFavorite': case 'removeTaskFavorite': {
      const task = getTask(data, taskId), favorites = new Set(data.taskCommands.taskFavorites[data.currentMemberId] ?? []), before = favorites.has(task.id);
      if (id === 'addTaskFavorite') favorites.add(task.id); else favorites.delete(task.id);
      data.taskCommands.taskFavorites[data.currentMemberId] = [...favorites];
      if (before !== favorites.has(task.id)) data.tasks[task.id] = { ...task, version: task.version + 1 };
      return { data: { taskId: task.id, isFavorite: favorites.has(task.id) } };
    }
    case 'archiveTask': case 'deleteTask': {
      const body = VersionInputSchema.parse(input.body), task = editable(data, taskId, body.expectedVersion), lifecycleAt = clock.now();
      const next = { ...task, version: task.version + 1, updatedAt: lifecycleAt, ...(id === 'archiveTask' ? { archivedAt: lifecycleAt } : {}) };
      data.tasks[task.id] = next; if (id === 'deleteTask') data.taskCommands.deletedTasks[task.id] = lifecycleAt;
      const activity = addActivity(data, next, id === 'archiveTask' ? 'task.archived' : 'task.deleted', clock), undoId = newMockId(clock);
      data.taskCommands.lifecycleUndoRecords[undoId] = { actorId: data.currentMemberId, kind: id === 'archiveTask' ? 'task.archive' : 'task.delete', entityId: task.id, postVersion: next.version, lifecycleAt, previousArchivedAt: task.archivedAt, taskId: null, taskPostVersion: null, activityIds: [activity], result: null };
      return { data: { task: projectTask(next, data), createdTasks: [], affectedProjectIds: [task.projectId], undo: { id: undoId, kind: id === 'archiveTask' ? 'task.archive' : 'task.delete' } } };
    }
    case 'getFile': { return { data: accessibleFile(data, String(input.fileId)) }; }
    case 'uploadProjectFile': {
      const body = UploadProjectFileInputSchema.parse(input.body), projectId = EntityIdSchema.parse(input.projectId), project = data.projects[projectId];
      if (!canReadProject(project, data) || project.archivedAt) return fail('NOT_FOUND', 'Project not found');
      const task = body.taskId ? getTask(data, body.taskId) : null;
      if (task && (task.projectId !== projectId || task.archivedAt)) return fail('VALIDATION_ERROR', 'File target must be an active task in this project', 'taskId');
      const contentHash = await crypto.subtle.digest('SHA-256', body.file.bytes as Uint8Array<ArrayBuffer>);
      const signature = await fingerprint({ projectId, taskId: body.taskId ?? null, name: body.file.name, mimeType: body.file.mimeType, size: body.file.bytes.byteLength, contentHash: [...new Uint8Array(contentHash)] });
      const requests = data.taskCommands.uploadRequests[data.currentMemberId] ?? {}, prior = requests[body.clientRequestId];
      if (prior) { if (prior.fingerprint !== signature) return fail('CONFLICT', 'Upload request ID was reused with different content'); const file = accessibleFile(data, prior.fileId); if (file.projectId !== projectId || file.taskId !== (body.taskId ?? null)) return fail('CONFLICT', 'The file target changed'); return { data: file }; }
      const file = FileSchema.parse({ id: newMockId(clock), workspaceId: data.workspaceId, projectId, taskId: task?.id ?? null, name: body.file.name, fileType: sourceFileType(body.file.name), mimeType: body.file.mimeType, sizeBytes: body.file.bytes.byteLength, displaySize: displayFileSize(body.file.bytes.byteLength), storageMode: 'sample', contentAvailable: false, createdBy: data.currentMemberId, createdAt: clock.now(), version: 1 });
      data.files[file.id] = file; requests[body.clientRequestId] = { fingerprint: signature, fileId: file.id }; data.taskCommands.uploadRequests[data.currentMemberId] = requests;
      if (task) { touchAttachments(data, task, clock); addActivity(data, data.tasks[task.id]!, 'file.created', clock); }
      return { data: file };
    }
    case 'deleteFile': {
      const body = VersionInputSchema.parse(input.body), file = accessibleFile(data, String(input.fileId));
      if (file.version !== body.expectedVersion) return fail('CONFLICT', 'The file changed. Refresh and try again.');
      const task = file.taskId ? editable(data, file.taskId, data.tasks[file.taskId]!.version) : null, lifecycleAt = clock.now(), next = { ...file, version: file.version + 1 };
      data.files[file.id] = next; data.taskCommands.deletedFiles[file.id] = lifecycleAt; if (task) touchAttachments(data, task, clock);
      const undoId = newMockId(clock), activityIds = task ? [addActivity(data, data.tasks[task.id]!, 'file.deleted', clock)] : [];
      data.taskCommands.lifecycleUndoRecords[undoId] = { actorId: data.currentMemberId, kind: 'file.delete', entityId: file.id, postVersion: next.version, lifecycleAt, previousArchivedAt: null, taskId: task?.id ?? null, taskPostVersion: task ? data.tasks[task.id]!.version : null, activityIds, result: null };
      return { data: { file: next, undo: { id: undoId, kind: 'file.delete' } } };
    }
    case 'createSubtask': case 'updateSubtask': case 'deleteSubtask': case 'promoteSubtask': {
      const body = id === 'createSubtask' ? CreateSubtaskInputSchema.parse(input.body) : id === 'updateSubtask' ? UpdateSubtaskInputSchema.parse(input.body) : TaskVersionInputSchema.parse(input.body);
      const task = editable(data, taskId, body.expectedTaskVersion);
      const existing = Object.values(data.subtasks).filter(row => row.taskId === task.id);
      const assigneeId = 'assigneeId' in body && body.assigneeId ? EntityIdSchema.parse(body.assigneeId) : null;
      if (assigneeId && (!data.members[assigneeId] || data.members[assigneeId]!.workspaceId !== data.workspaceId)) return fail('VALIDATION_ERROR', 'Choose a member in this workspace', 'assigneeId');
      if (id === 'createSubtask') {
        if (existing.length >= 128) return fail('PAYLOAD_TOO_LARGE', 'A task can contain at most 128 subtasks');
        const draft = CreateSubtaskInputSchema.parse(body);
        const child = SubtaskSchema.parse({ title: draft.title, done: draft.done, assigneeId: draft.assigneeId, dueDate: draft.dueDate, note: draft.note, id: newMockId(clock), taskId: task.id, position: Math.max(-100, ...existing.map(row => row.position)) + 100 });
        data.subtasks[child.id] = child; addActivity(data, task, 'task.updated', clock, `added subtask “${child.title}”`);
      } else {
        const child = data.subtasks[EntityIdSchema.parse(input.subtaskId)];
        if (!child || child.taskId !== task.id) return fail('NOT_FOUND', 'Subtask not found');
        if (id === 'updateSubtask') {
          const parsed = UpdateSubtaskInputSchema.parse(body), patch = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'expectedTaskVersion'));
          data.subtasks[child.id] = SubtaskSchema.parse({ ...child, ...patch });
          if (patch.done !== undefined && patch.done !== child.done) addActivity(data, task, 'task.updated', clock, `${patch.done ? 'completed' : 'reopened'} subtask “${child.title}”`);
        } else {
          if (id === 'promoteSubtask') {
            const created = TaskSchema.parse({ ...task, id: newMockId(clock), key: allocateTaskKey(data, task.projectId), title: child.title, descriptionHtml: plainDescriptionHtml(child.note), status: child.done ? 'done' : 'todo', assigneeId: child.assigneeId ?? task.assigneeId, startDate: null, dueDate: child.dueDate, completedAt: child.done ? clock.now() : null, archivedAt: null, estimate: null, recurrence: null, dependencyIds: [], position: Math.max(0, ...Object.values(data.tasks).map(row => row.position)) + 100, version: 1, isFavorite: false, attachmentCount: 0, commentCount: 0, subtaskSummary: { total: 0, completed: 0 }, createdAt: clock.now(), updatedAt: clock.now() });
            validate(created, data, true); data.tasks[created.id] = created; data.taskCommands.descriptionTexts[created.id] = normalizeDescription(created.descriptionHtml).text;
            delete data.subtasks[child.id]; touchChildren(data, task, clock);
            addActivity(data, task, 'task.updated', clock, `converted a subtask into ${created.key}`); addActivity(data, created, 'task.created', clock);
            return { data: { task: projectTask(data.tasks[task.id]!, data), createdTasks: [projectTask(created, data)], affectedProjectIds: [task.projectId], undo: null } };
          }
          delete data.subtasks[child.id];
        }
      }
      touchChildren(data, task, clock); return { data: detailOf(data, data.tasks[task.id]!) };
    }
    case 'listMembers': {
      const actor = data.members[data.currentMemberId]; if (!actor || actor.status !== 'active' || actor.workspaceId !== data.workspaceId) return fail('NOT_FOUND', 'Workspace data is not available');
      const query = MemberQuerySchema.parse(input.query), { cursor, limit, ...scope } = query;
      const rows = Object.values(data.members).filter(row => row.workspaceId === data.workspaceId && (!query.q || row.name.toLowerCase().includes(query.q.toLowerCase()) || row.email.toLowerCase().includes(query.q.toLowerCase())) && (!query.teamId || row.teamId === query.teamId) && (!query.status || row.status === query.status)).sort((a, b) => a.id.localeCompare(b.id));
      return { data: await cursorPage(rows, { cursor, limit }, { ...scope, workspaceId: data.workspaceId, actorId: data.currentMemberId }, false) };
    }
    case 'listComments': {
      const task = getTask(data, taskId), query = CursorQuerySchema.parse(input.query);
      const rows = Object.values(data.comments).filter(row => row.taskId === task.id && !data.taskCommands.deletedComments[row.id]).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      return { data: await cursorPage(rows, query, { taskId }, false) };
    }
    case 'listActivity': {
      const actor = data.members[data.currentMemberId]; if (!actor || actor.status !== 'active' || actor.workspaceId !== data.workspaceId) return fail('NOT_FOUND', 'Workspace data is not available');
      const query = ActivityQuerySchema.parse(input.query), { cursor, limit, ...scope } = query;
      if (query.actorId && data.members[query.actorId]?.workspaceId !== data.workspaceId) return fail('NOT_FOUND', 'Member not found');
      if (query.taskId) getTask(data, query.taskId);
      if (query.projectId && !canReadProject(data.projects[query.projectId], data)) return fail('NOT_FOUND', 'Project not found');
      const rows = Object.values(data.activity).filter(row => {
        const task = row.taskId ? data.tasks[row.taskId] : null, parentId = task?.projectId ?? row.projectId;
        if (row.actorId && data.members[row.actorId]?.workspaceId !== data.workspaceId) return false;
        if (task && row.projectId && row.projectId !== task.projectId) return false;
        if (row.taskId && (!task || task.workspaceId !== data.workspaceId || data.taskCommands.deletedTasks[row.taskId])) return false;
        if (row.projectId && (!canReadProject(data.projects[row.projectId], data) || data.projects[row.projectId]!.archivedAt)) return false;
        if (parentId && (!canReadProject(data.projects[parentId], data) || data.projects[parentId]!.archivedAt)) return false;
        return (!query.projectId || parentId === query.projectId) && (!query.taskId || row.taskId === query.taskId) && (!query.actorId || row.actorId === query.actorId);
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return { data: await cursorPage(rows, { cursor, limit }, scope, true) };
    }
    case 'createComment': {
      const body = CreateCommentInputSchema.parse(input.body), task = getTask(data, taskId); editable(data, task.id, task.version);
      for (const memberId of body.mentionedMemberIds) if (!data.members[memberId] || data.members[memberId]!.workspaceId !== data.workspaceId) return fail('VALIDATION_ERROR', 'Mentioned member is not in this workspace', 'mentionedMemberIds');
      const comment = CommentSchema.parse({ ...body, id: newMockId(clock), workspaceId: data.workspaceId, taskId: task.id, authorId: data.currentMemberId, createdAt: clock.now(), version: 1, reactions: [] });
      data.comments[comment.id] = comment; touchComments(data, task, clock); addActivity(data, task, 'comment.created', clock);
      return { data: { comment, task: projectTask(data.tasks[task.id]!, data), undo: null } };
    }
    case 'deleteComment': case 'restoreDeletedComment': {
      const body = VersionInputSchema.parse(input.body), comment = commentOf(data, String(input.commentId), id === 'restoreDeletedComment');
      if (comment.authorId !== data.currentMemberId) return fail('NOT_FOUND', 'Comment not found');
      if (comment.version !== body.expectedVersion) return fail('CONFLICT', 'The comment changed. Refresh and try again.');
      const task = getTask(data, comment.taskId); editable(data, task.id, task.version);
      const next = { ...comment, version: comment.version + 1 };
      data.comments[comment.id] = next;
      if (id === 'restoreDeletedComment') { if (!data.taskCommands.deletedComments[comment.id]) return fail('CONFLICT', 'The comment is already active'); delete data.taskCommands.deletedComments[comment.id]; touchComments(data, task, clock); return { data: { comment: next, task: projectTask(data.tasks[task.id]!, data), undo: null } }; }
      const deletedAt = clock.now(); data.taskCommands.deletedComments[comment.id] = deletedAt; touchComments(data, task, clock);
      const undoId = newMockId(clock); data.taskCommands.commentUndoRecords[undoId] = { actorId: data.currentMemberId, commentId: comment.id, taskId: task.id, commentPostVersion: next.version, taskPostVersion: data.tasks[task.id]!.version, deletedAt, result: null };
      return { data: { comment: next, task: projectTask(data.tasks[task.id]!, data), undo: { id: undoId, kind: 'comment.delete' } } };
    }
    case 'addCommentReaction': case 'removeCommentReaction': {
      const comment = commentOf(data, String(input.commentId)), task = getTask(data, comment.taskId); editable(data, task.id, task.version);
      const key = ReactionKeySchema.parse(input.reactionKey), prior = comment.reactions.find(row => row.key === key), members = new Set(prior?.memberIds ?? []), before = members.has(data.currentMemberId);
      if (id === 'addCommentReaction') members.add(data.currentMemberId); else members.delete(data.currentMemberId);
      if (before !== members.has(data.currentMemberId)) {
        const reactions = comment.reactions.filter(row => row.key !== key); if (members.size) reactions.push({ key, count: members.size, memberIds: [...members] });
        data.comments[comment.id] = { ...comment, version: comment.version + 1, reactions }; touchComments(data, task, clock);
      }
      return { data: data.comments[comment.id]!.reactions };
    }
    case 'bulkMutateTasks': {
      const body = BulkMutateTasksInputSchema.parse(input.body);
      if (body.operation === 'complete' || body.operation === 'archive' || body.operation === 'sortPriority') {
        const scope = body.columnScope;
        if (scope.kind === 'project' && (!canReadProject(data.projects[scope.projectId], data) || data.projects[scope.projectId]!.archivedAt)) return fail('NOT_FOUND', 'Column project not found');
        const full = Object.values(data.tasks).filter(task => task.workspaceId === data.workspaceId && task.status === scope.status && !task.archivedAt && !data.taskCommands.deletedTasks[task.id] && !data.projects[task.projectId]?.archivedAt && canReadProject(data.projects[task.projectId], data) && (scope.kind === 'workspace' || task.projectId === scope.projectId));
        if (full.length > 20) return fail('PAYLOAD_TOO_LARGE', 'A column command supports at most 20 tasks. No tasks were changed.');
        if (full.length !== body.items.length || full.some(task => !body.items.some(item => item.id === task.id))) return fail('CONFLICT', 'The column changed. Refresh and try again. No tasks were changed.');
        const originals = body.items.map(item => editable(data, item.id, item.expectedVersion));
        if (body.operation === 'sortPriority') {
          const weight = (task: TaskDto) => priorities.find(priority => priority.id === task.priority)!.weight;
          const sorted = [...originals].sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id)), base = originals.length ? Math.min(...originals.map(task => task.position)) : 0;
          sorted.forEach((task, index) => { data.tasks[task.id] = { ...task, position: base + index * 100, updatedAt: clock.now(), version: task.version + 1 }; });
          return { data: { tasks: sorted.map(task => projectTask(data.tasks[task.id]!, data)), createdTasks: [], affectedProjectIds: [...new Set(sorted.map(task => task.projectId))], undo: null } };
        }
        if (!originals.length && body.operation === 'complete') return { data: { tasks: [], createdTasks: [], affectedProjectIds: [], undo: null } };
        const undoId = newMockId(clock), beforeActivity = new Set(Object.keys(data.activity));
        const parents = originals.map(task => ({ taskId: task.id, postVersion: task.version, status: task.status, completedAt: task.completedAt, archivedAt: task.archivedAt, updatedAt: task.updatedAt, previousStatus: data.taskCommands.previousStatuses[task.id] ?? null }));
        const createdTasks: TaskDto[] = [], successors: MockDataset['taskCommands']['columnUndoRecords'][TaskDto['id']]['successors'] = [];
        for (const original of originals) {
          if (body.operation === 'complete') {
            const result = patchTask(data, data.tasks[original.id]!, { status: 'done' }, clock);
            createdTasks.push(...result.createdTasks); successors.push(...result.createdTasks.map(task => ({ taskId: task.id, sourceTaskId: original.id, postVersion: task.version })));
          } else { const next = { ...original, archivedAt: clock.now(), updatedAt: clock.now(), version: original.version + 1 }; data.tasks[original.id] = next; addActivity(data, next, 'task.archived', clock); }
        }
        parents.forEach(parent => { parent.postVersion = data.tasks[parent.taskId]!.version; });
        successors.forEach(child => { child.postVersion = data.tasks[child.taskId]!.version; });
        const dependencies = [...new Set(createdTasks.flatMap(task => task.dependencyIds))].filter(id => !parents.some(parent => parent.taskId === id) && !successors.some(child => child.taskId === id)).map(taskId => ({ taskId, postVersion: data.tasks[taskId]!.version }));
        const record = { actorId: data.currentMemberId, kind: body.operation === 'complete' ? 'tasks.completeColumn' as const : 'tasks.archiveCompletedColumn' as const, parents, successors, dependencies, activityIds: Object.values(data.activity).filter(event => !beforeActivity.has(event.id)).map(event => event.id), result: null };
        if (parents.length + successors.length + dependencies.length > 128 || new TextEncoder().encode(JSON.stringify(record)).length > 65536) return fail('PAYLOAD_TOO_LARGE', 'The bounded Undo record is too large. No tasks were changed.');
        data.taskCommands.columnUndoRecords[undoId] = record;
        return { data: { tasks: originals.map(task => projectTask(data.tasks[task.id]!, data)), createdTasks: createdTasks.map(task => projectTask(data.tasks[task.id]!, data)), affectedProjectIds: [...new Set(originals.map(task => task.projectId))], undo: { id: undoId, kind: record.kind } } };
      }
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
    case 'getTask': { return { data: detailOf(data, getTask(data, taskId)) }; }
    case 'listTasks': case 'getTaskSummary': {
      const query = normalizeTaskView({ query: input.query }).query, { cursor, limit, ...scope } = query;
      const available = Object.values(data.tasks).filter(task => task.workspaceId === data.workspaceId && !data.taskCommands.deletedTasks[task.id] && canReadProject(data.projects[task.projectId], data) && !data.projects[task.projectId]!.archivedAt);
      const env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: Object.values(data.members), projects: Object.values(data.projects).filter(project => canReadProject(project, data)) } };
      const view = evaluateTaskView(available.map(task => projectTask(task, data)), normalizeTaskView({ query }), env), tasks = view.taskIds.map(value => data.tasks[value]!);
      if (id === 'getTaskSummary') return { data: summarizeTasks(tasks, clock.today()) };
      const queryFingerprint = await fingerprint(scope); let start = 0;
      if (cursor) {
        try { const decoded = CursorPayloadSchema.parse(JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')))); if (decoded.queryFingerprint !== queryFingerprint || decoded.sortField !== query.sortField || decoded.sortDirection !== query.sortDirection) return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor'); const index = tasks.findIndex(task => compareTaskTuple({ value: taskSortValue(task, query.sortField, env.lookups), id: task.id }, { value: decoded.sortValue, id: decoded.id }, query.sortDirection) > 0); start = index < 0 ? tasks.length : index; } catch (error) { if (error instanceof StudioApiError) throw error; return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor'); }
      }
      const items = tasks.slice(start, start + limit).map(task => projectTask(task, data)), last = items.at(-1);
      return { data: { items, total: tasks.length, nextCursor: last && start + items.length < tasks.length ? encode({ formatVersion: 1, queryFingerprint, sortField: query.sortField, sortDirection: query.sortDirection, sortValue: taskSortValue(last, query.sortField, env.lookups), id: last.id }) : null } };
    }
    case 'updateTask': { const { expectedVersion, ...patch } = UpdateTaskInputSchema.parse(input.body); if (patch.descriptionHtml !== undefined) patch.descriptionHtml = normalizeDescription(patch.descriptionHtml).html; const task = editable(data, taskId, expectedVersion); return { data: patchTask(data, task, definedPatch(patch), clock) }; }
    case 'moveTask': {
      const body = MoveTaskInputSchema.parse(input.body), task = editable(data, taskId, body.expectedVersion);
      const projectId = body.targetProjectId ?? task.projectId;
      const groupPatch = definedPatch(body.groupPatch ?? {});
      const prospective = { ...task, ...groupPatch, projectId }; validate(prospective.status !== task.status ? { ...prospective, completedAt: prospective.status === 'done' ? clock.now() : null } : prospective, data);
      const env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: Object.values(data.members), projects: Object.values(data.projects) } };
      const { groupBy, groupKey, ...scope } = body.scope;
      const destination = evaluateTaskView(Object.values(data.tasks).filter(row => row.id !== task.id && !data.taskCommands.deletedTasks[row.id] && !row.archivedAt && !data.projects[row.projectId]?.archivedAt && canReadProject(data.projects[row.projectId], data)), normalizeTaskView({ query: { ...scope, ...(body.targetProjectId ? { projectId } : {}), sortField: 'manual', sortDirection: 'asc' }, groupBy: groupBy ?? 'none' }), env);
      const ids = groupBy && groupKey !== undefined ? destination.groups.find(group => group.key === (groupKey ?? 'none'))?.taskIds ?? [] : destination.taskIds;
      const prospectiveView = evaluateTaskView([prospective.status !== task.status ? { ...prospective, completedAt: prospective.status === 'done' ? clock.now() : null } : prospective], normalizeTaskView({ query: { ...scope, ...(body.targetProjectId ? { projectId } : {}), sortField: 'manual', sortDirection: 'asc' }, groupBy: groupBy ?? 'none' }), env);
      if (!prospectiveView.taskIds.includes(task.id) || (groupBy && groupKey !== undefined && !prospectiveView.groups.some(group => group.key === (groupKey ?? 'none') && group.taskIds.includes(task.id)))) return fail('VALIDATION_ERROR', 'Moved task is outside the destination scope or group');
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
      const undoId = EntityIdSchema.parse(input.undoId);
      const column = data.taskCommands.columnUndoRecords[undoId];
      if (column) {
        if (column.actorId !== data.currentMemberId) return fail('NOT_FOUND', 'Undo command not found');
        for (const target of [...column.parents, ...column.successors, ...column.dependencies]) { const task=data.tasks[target.taskId]; if(!task || !canReadProject(data.projects[task.projectId], data)) return fail('NOT_FOUND','Undo target not found'); }
        if (column.result) return { data: column.result };
        for (const target of [...column.parents, ...column.successors, ...column.dependencies]) {
          const task = data.tasks[target.taskId]!;
          if (task.version !== target.postVersion || data.taskCommands.deletedTasks[task.id] || data.projects[task.projectId]!.archivedAt || (column.kind === 'tasks.completeColumn' && task.archivedAt) || (column.kind === 'tasks.archiveCompletedColumn' && !task.archivedAt)) return fail('CONFLICT', 'An Undo target changed. No tasks were restored.');
        }
        for (const child of column.successors) if (data.taskCommands.recurrenceSlots[child.sourceTaskId] !== child.taskId || Object.values(data.tasks).some(task => task.dependencyIds.includes(child.taskId))) return fail('CONFLICT', 'A recurring successor changed. No tasks were restored.');
        for (const parent of column.parents) { const task = data.tasks[parent.taskId]!; data.tasks[task.id] = { ...task, status: parent.status, completedAt: parent.completedAt, archivedAt: parent.archivedAt, updatedAt: parent.updatedAt, version: task.version + 1 }; if (parent.previousStatus) data.taskCommands.previousStatuses[task.id] = parent.previousStatus; else delete data.taskCommands.previousStatuses[task.id]; }
        for (const child of column.successors) { const task = data.tasks[child.taskId]!; data.tasks[task.id] = { ...task, version: task.version + 1 }; data.taskCommands.deletedTasks[task.id] = clock.now(); delete data.taskCommands.recurrenceSlots[child.sourceTaskId]; }
        for (const target of column.dependencies) data.tasks[target.taskId] = { ...data.tasks[target.taskId]!, version: target.postVersion + 1 };
        column.activityIds.forEach(id => { delete data.activity[id]; });
        const taskIds = [...column.parents, ...column.successors, ...column.dependencies].map(target => target.taskId);
        column.result = UndoResultSchema.parse({ undoId, kind: column.kind, appliedAt: clock.now(), affected: { taskIds, projectIds: [...new Set(taskIds.map(id => data.tasks[id]!.projectId))], memberIds: [], teamIds: [], commentIds: [], fileIds: [] } }); return { data: column.result };
      }
      const commentUndo = data.taskCommands.commentUndoRecords[undoId];
      if (commentUndo) {
        if (commentUndo.actorId !== data.currentMemberId) return fail('NOT_FOUND', 'Undo command not found');
        const comment = commentOf(data, commentUndo.commentId, true), task = getTask(data, commentUndo.taskId);
        if (commentUndo.result) return { data: commentUndo.result };
        editable(data, task.id, commentUndo.taskPostVersion);
        if (comment.version !== commentUndo.commentPostVersion || data.taskCommands.deletedComments[comment.id] !== commentUndo.deletedAt) return fail('CONFLICT', 'The deleted comment changed. Undo cannot be applied.');
        delete data.taskCommands.deletedComments[comment.id]; data.comments[comment.id] = { ...comment, version: comment.version + 1 }; touchComments(data, task, clock);
        commentUndo.result = UndoResultSchema.parse({ undoId, kind: 'comment.delete', appliedAt: clock.now(), affected: { taskIds: [task.id], projectIds: [task.projectId], memberIds: [], teamIds: [], commentIds: [comment.id], fileIds: [] } });
        return { data: commentUndo.result };
      }
      const lifecycle = data.taskCommands.lifecycleUndoRecords[undoId];
      if (lifecycle) return { data: undoLifecycle(data, undoId, lifecycle, clock) };
      const deleted = data.taskCommands.deleteUndoRecords[undoId];
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
export async function runTaskFieldOperation(id: OperationId, input: Record<string, unknown>, data: MockDataset, clock: Clock): Promise<unknown> {
  if (['getTask', 'listTasks', 'getTaskSummary', 'getFile', 'listComments', 'listActivity', 'listMembers'].includes(id)) return executeTaskOperation(id, input, data, clock);
  return transactMock(data, staged => executeTaskOperation(id, input, staged, clock));
}
