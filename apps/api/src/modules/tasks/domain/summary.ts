import type { Priority, TaskStatus, TaskSummaryDto } from '@studio/contracts/api';
import { PrioritySchema, TaskStatusSchema } from '@studio/contracts/api';
export interface TaskCountGroup {
  status: TaskStatus;
  priority: Priority;
  total: number;
  overdue: number;
  subtaskTotal: number;
  subtaskCompleted: number;
}
export function taskSummaryFromGroups(groups: readonly TaskCountGroup[]): TaskSummaryDto {
  const result: TaskSummaryDto = {
    total: 0,
    byStatus: { backlog: 0, todo: 0, progress: 0, review: 0, done: 0 },
    byPriority: { urgent: 0, high: 0, medium: 0, low: 0, none: 0 },
    overdue: 0,
    completed: 0,
    completionRate: 0,
    subtaskTotals: { total: 0, completed: 0 },
  };
  for (const group of groups) {
    result.total += group.total;
    result.byStatus[TaskStatusSchema.parse(group.status)] += group.total;
    result.byPriority[PrioritySchema.parse(group.priority)] += group.total;
    result.overdue += group.overdue;
    result.subtaskTotals.total += group.subtaskTotal;
    result.subtaskTotals.completed += group.subtaskCompleted;
  }
  result.completed = result.byStatus.done;
  result.completionRate = result.total ? Math.round((result.completed / result.total) * 100) : 0;
  return result;
}
