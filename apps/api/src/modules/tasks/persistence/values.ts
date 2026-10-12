import { EntityIdSchema, LabelIdSchema } from '@studio/contracts/api';
import type { SubtaskRow, TaskProjection, TaskRow } from './model.ts';
import type { TaskRelations } from './relations.ts';

export const dependencyIds = (t: TaskProjection): string[] =>
  EntityIdSchema.array().parse(JSON.parse(t.dependenciesJson));
export const visibleDependencies = (t: TaskProjection): string[] =>
  EntityIdSchema.array().parse(JSON.parse(t.visibleDependenciesJson));
export const labelIds = (t: TaskProjection): string[] =>
  LabelIdSchema.array().parse(JSON.parse(t.labelsJson));
export const relation = (
  t: TaskRow,
  deps: string[] = [],
  children: SubtaskRow[] = [],
): TaskRelations => ({
  id: t.id,
  projectId: t.projectId,
  assigneeId: t.assigneeId,
  dependencyIds: deps,
  subtaskAssigneeIds: children.map((c) => c.assigneeId),
});
