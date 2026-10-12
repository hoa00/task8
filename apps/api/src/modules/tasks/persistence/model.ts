import type { activity, subtasks, tasks } from '../../../db/schema.ts';
export type TaskRow = Omit<typeof tasks.$inferSelect, 'readKeys'>;
export type SubtaskRow = typeof subtasks.$inferSelect;
export type ActivityRow = typeof activity.$inferInsert;
export type TaskProjection = TaskRow & {
  projectKey: string;
  labelsJson: string;
  dependenciesJson: string;
  visibleDependenciesJson: string;
  subtaskTotal: number;
  subtaskDone: number;
  attachmentCount: number;
  commentCount: number;
  favorite: number;
};
