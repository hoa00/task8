import type { SubtaskDto } from '@studio/contracts/api';
import { SubtaskSchema, TaskSchema, TaskStatusSchema } from '@studio/contracts/api';
import { instant, nullableInstant } from '../../shared/clock.ts';
import type { CompletionState } from './domain/model.ts';

export function completionProjection(input: {
  status: string;
  previousStatus: string | null;
  completedAt: number | null;
}): CompletionState {
  return {
    status: TaskStatusSchema.parse(input.status),
    previousStatus:
      input.previousStatus === null ? null : TaskStatusSchema.parse(input.previousStatus),
    completedAt: input.completedAt,
  };
}

export interface TaskDtoInput {
  id: string;
  workspaceId: string;
  projectId: string;
  projectKey: string;
  number: number;
  title: string;
  descriptionHtml: string;
  status: string;
  assigneeId: string | null;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  estimate: string | null;
  recurrence: string | null;
  labelsJson: string;
  visibleDependenciesJson: string;
  position: number;
  completedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  favorite: number;
  subtaskTotal: number;
  subtaskDone: number;
  attachmentCount: number;
  commentCount: number;
}
export function taskDto(t: TaskDtoInput) {
  return TaskSchema.parse({
    id: t.id,
    workspaceId: t.workspaceId,
    projectId: t.projectId,
    key: `${t.projectKey}-${t.number}`,
    title: t.title,
    descriptionHtml: t.descriptionHtml,
    status: t.status,
    assigneeId: t.assigneeId,
    priority: t.priority,
    startDate: t.startDate,
    dueDate: t.dueDate,
    estimate: t.estimate,
    recurrence: t.recurrence,
    labelIds: JSON.parse(t.labelsJson),
    dependencyIds: JSON.parse(t.visibleDependenciesJson),
    position: t.position,
    completedAt: nullableInstant(t.completedAt),
    archivedAt: nullableInstant(t.archivedAt),
    createdAt: instant(t.createdAt),
    updatedAt: instant(t.updatedAt),
    version: t.version,
    isFavorite: !!t.favorite,
    subtaskSummary: { total: t.subtaskTotal, completed: t.subtaskDone },
    attachmentCount: t.attachmentCount,
    commentCount: t.commentCount,
  });
}

export interface SubtaskDtoInput {
  id: string;
  taskId: string;
  title: string;
  done: boolean | number;
  assigneeId: string | null;
  dueDate: string | null;
  note: string;
  position: number;
}
export function subtaskDto(c: SubtaskDtoInput): SubtaskDto {
  return SubtaskSchema.parse({
    id: c.id,
    taskId: c.taskId,
    title: c.title,
    done: !!c.done,
    assigneeId: c.assigneeId,
    dueDate: c.dueDate,
    note: c.note,
    position: c.position,
  });
}
