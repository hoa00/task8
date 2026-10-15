import { GroupBySchema, TaskQuerySchema } from '@studio/contracts/api';
import type { TaskFilter, TaskQuery } from '@studio/contracts/api';
export type TaskGroupBy = 'none' | 'status' | 'priority' | 'assignee' | 'project' | 'due';
export interface TaskEvaluation {
  query: TaskQuery;
  groupBy: TaskGroupBy;
}
export function normalizeTaskQuery(input: unknown = {}): TaskQuery {
  const query = TaskQuerySchema.parse(input);
  return {
    ...query,
    filters: query.filters.map(
      (filter) => ({ ...filter, values: [...new Set<string | null>(filter.values)] }) as TaskFilter,
    ),
  };
}
export function normalizeTaskEvaluation(
  input: { query?: unknown; groupBy?: unknown } = {},
): TaskEvaluation {
  return {
    query: normalizeTaskQuery(input.query ?? {}),
    groupBy: GroupBySchema.parse(input.groupBy ?? 'status'),
  };
}
