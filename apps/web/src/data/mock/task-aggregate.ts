import {
  ActivitySchema,
  EntityIdSchema,
  TaskSchema,
  UndoResultSchema,
} from '@studio/contracts/api';
import type { TaskDto, TaskMutationDto } from '@studio/contracts/api';
import {
  changedDependencyTargets,
  nextRecurrenceDate,
  TaskRelationError,
  validateTaskRelations,
  normalizeDescription,
} from '@studio/domain';
import { canReadMockProject as canReadProject } from './project-access.ts';
import { accessibleMockFile, canReadMockFile } from './file-access.ts';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { fail, newMockId } from './primitives.ts';

export function getTask(data: MockDataset, id: string): TaskDto {
  const task = data.tasks[EntityIdSchema.parse(id)];
  if (
    !task ||
    data.taskCommands.deletedTasks[task.id] ||
    task.workspaceId !== data.workspaceId ||
    !canReadProject(data.projects[task.projectId], data)
  )
    return fail('NOT_FOUND', 'Task not found');
  return task;
}

export function editable(data: MockDataset, id: string, version: number): TaskDto {
  const task = getTask(data, id);
  if (task.version !== version)
    return fail('CONFLICT', 'The task changed. Review the current values and try again.');
  if (task.archivedAt || data.projects[task.projectId]!.archivedAt)
    return fail('CONFLICT', 'Archived tasks cannot be edited');
  return task;
}

export function projectTask(task: TaskDto, data: MockDataset): TaskDto {
  return {
    ...task,
    isFavorite: (data.taskCommands.taskFavorites[data.currentMemberId] ?? []).includes(task.id),
    dependencyIds: task.dependencyIds.filter((id) => {
      const target = data.tasks[id];
      return (
        !!target &&
        !data.taskCommands.deletedTasks[id] &&
        !target.archivedAt &&
        canReadProject(data.projects[target.projectId], data) &&
        !data.projects[target.projectId]!.archivedAt
      );
    }),
  };
}

export function validate(task: TaskDto, data: MockDataset, explicitDependencies = false) {
  const parsed = TaskSchema.safeParse(task);
  if (!parsed.success)
    return fail('VALIDATION_ERROR', 'Start date must be on or before due date', 'startDate');
  try {
    const activeProjects = Object.fromEntries(
      Object.entries(data.projects).filter(
        ([, row]) => !data.projectCommands.deletedProjects[row.id],
      ),
    );
    const activeTasks = Object.fromEntries(
      Object.entries(data.tasks).filter(
        ([, row]) => !data.taskCommands.deletedTasks[row.id] && !!activeProjects[row.projectId],
      ),
    );
    validateTaskRelations(explicitDependencies ? task : projectTask(task, data), {
      ...data,
      projects: activeProjects,
      tasks: activeTasks,
    });
  } catch (error) {
    if (error instanceof TaskRelationError)
      return fail(
        error.reason === 'cycle' ? 'CONFLICT' : 'VALIDATION_ERROR',
        error.message,
        error.field,
      );
    throw error;
  }
}

export function allocateTaskKey(data: MockDataset, projectId: TaskDto['projectId']): string {
  const number =
    (data.taskCommands.projectSequences[projectId] ??
      Math.max(
        200,
        ...Object.values(data.tasks)
          .filter((task) => task.projectId === projectId)
          .map((task) => Number(task.key.split('-').at(-1))),
      )) + 1;
  data.taskCommands.projectSequences[projectId] = number;
  return `${data.projects[projectId]!.key}-${number}`;
}

export function transition(
  data: MockDataset,
  original: TaskDto,
  next: TaskDto,
  clock: Clock,
): TaskDto[] {
  const created: TaskDto[] = [];
  if (original.status === next.status) return created;
  next.completedAt = next.status === 'done' ? clock.now() : null;
  if (next.status === 'done') {
    data.taskCommands.previousStatuses[original.id] = original.status;
    if (next.recurrence && next.dueDate && !data.taskCommands.recurrenceSlots[original.id]) {
      const dueDate = nextRecurrenceDate(next.dueDate, next.recurrence),
        project = data.projects[next.projectId]!;
      const successor = TaskSchema.parse({
        ...next,
        dependencyIds: projectTask(next, data).dependencyIds,
        id: newMockId(clock),
        key: allocateTaskKey(data, project.id),
        status: 'todo',
        completedAt: null,
        startDate: dueDate,
        dueDate,
        createdAt: clock.now(),
        updatedAt: clock.now(),
        version: 1,
        isFavorite: false,
        attachmentCount: 0,
        commentCount: 0,
        position:
          Math.max(
            0,
            ...Object.values(data.tasks)
              .filter((task) => task.projectId === project.id)
              .map((task) => task.position),
          ) + 100,
        subtaskSummary: { ...next.subtaskSummary, completed: 0 },
      });
      const subtasks = Object.values(data.subtasks)
        .filter((row) => row.taskId === original.id)
        .map((row) => ({ ...row, id: newMockId(clock), taskId: successor.id, done: false }));
      data.tasks[successor.id] = successor;
      data.taskCommands.descriptionTexts[successor.id] = normalizeDescription(
        successor.descriptionHtml,
      ).text;
      subtasks.forEach((row) => {
        data.subtasks[row.id] = row;
      });
      data.taskCommands.recurrenceSlots[original.id] = successor.id;
      created.push(successor);
    }
  }
  return created;
}

export function definedPatch(value: object): Partial<TaskDto> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<TaskDto>;
}

export function patchTask(
  data: MockDataset,
  original: TaskDto,
  patch: Partial<TaskDto>,
  clock: Clock,
): TaskMutationDto {
  const next = { ...original, ...patch, updatedAt: clock.now(), version: original.version + 1 };
  // Validate the prospective status/completedAt pair before any write.
  if (next.status !== original.status)
    next.completedAt = next.status === 'done' ? clock.now() : null;
  validate(next, data, patch.dependencyIds !== undefined);
  const createdTasks = transition(data, original, next, clock);
  for (const id of new Set([
    ...changedDependencyTargets(original.dependencyIds, next.dependencyIds),
    ...createdTasks.flatMap((task) => task.dependencyIds),
  ])) {
    const target = data.tasks[id]!;
    data.tasks[id] = { ...target, version: target.version + 1 };
  }
  data.tasks[next.id] = next;
  if (patch.descriptionHtml !== undefined)
    data.taskCommands.descriptionTexts[next.id] = normalizeDescription(next.descriptionHtml).text;
  const eventType =
    next.status !== original.status && next.status === 'done'
      ? 'task.completed'
      : next.projectId !== original.projectId
        ? 'task.moved'
        : next.assigneeId !== original.assigneeId
          ? 'task.assigned'
          : next.priority !== original.priority
            ? 'task.priorityChanged'
            : 'task.updated';
  const activity = ActivitySchema.parse({
    id: newMockId(clock),
    actorId: data.currentMemberId,
    eventType,
    taskId: next.id,
    projectId: next.projectId,
    createdAt: clock.now(),
    payload: {
      taskKey: next.key,
      taskTitle: next.title,
      previousStatus: original.status,
      status: next.status,
      priority: next.priority,
      assigneeId: next.assigneeId,
    },
  });
  data.activity[activity.id] = activity;
  for (const task of createdTasks) {
    const event = ActivitySchema.parse({
      ...activity,
      id: newMockId(clock),
      eventType: 'task.created',
      taskId: task.id,
      payload: { taskKey: task.key, taskTitle: task.title },
    });
    data.activity[event.id] = event;
  }
  return {
    task: projectTask(next, data),
    createdTasks: createdTasks.map((task) => projectTask(task, data)),
    affectedProjectIds: [...new Set([original.projectId, next.projectId])],
    undo: null,
  };
}

export function addActivity(
  data: MockDataset,
  task: TaskDto,
  eventType: string,
  clock: Clock,
  detail?: string,
): TaskDto['id'] {
  const event = ActivitySchema.parse({
    id: newMockId(clock),
    actorId: data.currentMemberId,
    eventType,
    taskId: task.id,
    projectId: task.projectId,
    createdAt: clock.now(),
    payload: { taskKey: task.key, taskTitle: task.title, ...(detail ? { detail } : {}) },
  });
  data.activity[event.id] = event;
  return event.id;
}

export const accessibleFile = accessibleMockFile;

export function touchAttachments(data: MockDataset, task: TaskDto, clock: Clock) {
  data.tasks[task.id] = {
    ...task,
    version: task.version + 1,
    updatedAt: clock.now(),
    attachmentCount: Object.values(data.files).filter(
      (file) => file.taskId === task.id && !data.taskCommands.deletedFiles[file.id],
    ).length,
  };
}

export function undoLifecycle(
  data: MockDataset,
  undoId: string,
  record: MockDataset['taskCommands']['lifecycleUndoRecords'][TaskDto['id']],
  clock: Clock,
) {
  if (record.actorId !== data.currentMemberId) return fail('NOT_FOUND', 'Undo command not found');
  if (record.kind === 'file.delete') accessibleFile(data, record.entityId, true);
  const file = record.kind === 'file.delete' ? data.files[record.entityId] : null,
    task =
      record.kind === 'file.delete'
        ? record.taskId
          ? data.tasks[record.taskId]
          : null
        : data.tasks[record.entityId];
  const projectId = file?.projectId ?? task?.projectId;
  if (!projectId || !canReadProject(data.projects[projectId], data))
    return fail('NOT_FOUND', 'Undo target not found');
  if (record.result) return record.result;
  if (data.projects[projectId]!.archivedAt)
    return fail('CONFLICT', 'The project changed. Undo cannot be applied.');
  if (record.kind === 'file.delete') {
    if (
      !file ||
      file.version !== record.postVersion ||
      data.taskCommands.deletedFiles[file.id] !== record.lifecycleAt ||
      (record.taskId &&
        (!task ||
          task.version !== record.taskPostVersion ||
          task.archivedAt ||
          data.taskCommands.deletedTasks[task.id] ||
          task.projectId !== file.projectId))
    )
      return fail('CONFLICT', 'The file or attached task changed. Undo cannot be applied.');
    delete data.taskCommands.deletedFiles[file.id];
    data.files[file.id] = { ...file, version: file.version + 1 };
    if (task) touchAttachments(data, task, clock);
  } else {
    if (
      !task ||
      task.version !== record.postVersion ||
      (record.kind === 'task.archive'
        ? task.archivedAt !== record.lifecycleAt || !!data.taskCommands.deletedTasks[task.id]
        : data.taskCommands.deletedTasks[task.id] !== record.lifecycleAt ||
          task.archivedAt !== record.previousArchivedAt)
    )
      return fail('CONFLICT', 'The task changed. Undo cannot be applied.');
    if (record.kind === 'task.delete') delete data.taskCommands.deletedTasks[task.id];
    data.tasks[task.id] = {
      ...task,
      archivedAt: record.previousArchivedAt,
      version: task.version + 1,
    };
  }
  record.activityIds.forEach((id) => {
    delete data.activity[id];
  });
  record.result = UndoResultSchema.parse({
    undoId,
    kind: record.kind,
    appliedAt: clock.now(),
    affected: {
      taskIds: task ? [task.id] : [],
      projectIds: [projectId],
      memberIds: [],
      teamIds: [],
      commentIds: [],
      fileIds: file ? [file.id] : [],
    },
  });
  return record.result;
}

export function detailOf(data: MockDataset, task: TaskDto) {
  return {
    task: projectTask(task, data),
    subtasks: Object.values(data.subtasks)
      .filter((row) => row.taskId === task.id)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    attachments: Object.values(data.files).filter(
      (row) => row.taskId === task.id && canReadMockFile(row, data),
    ),
  };
}

export function touchChildren(data: MockDataset, task: TaskDto, clock: Clock) {
  const rows = Object.values(data.subtasks).filter((row) => row.taskId === task.id);
  data.tasks[task.id] = {
    ...task,
    version: task.version + 1,
    updatedAt: clock.now(),
    subtaskSummary: { total: rows.length, completed: rows.filter((row) => row.done).length },
  };
}

export function touchComments(data: MockDataset, task: TaskDto, clock: Clock) {
  data.tasks[task.id] = {
    ...task,
    version: task.version + 1,
    updatedAt: clock.now(),
    commentCount: Object.values(data.comments).filter(
      (row) => row.taskId === task.id && !data.taskCommands.deletedComments[row.id],
    ).length,
  };
}

export function commentOf(data: MockDataset, id: string, includeDeleted = false) {
  const comment = data.comments[EntityIdSchema.parse(id)];
  if (!comment || (!includeDeleted && data.taskCommands.deletedComments[comment.id]))
    return fail('NOT_FOUND', 'Comment not found');
  getTask(data, comment.taskId);
  return comment;
}
