import type { TaskQuery } from '@studio/contracts/api';
import { normalizeTaskQuery } from '@studio/domain';
import { queryKeys } from '../../data/query-keys.ts';
export function taskDatasetQuery(query: TaskQuery): TaskQuery {
  const scope = Object.fromEntries(
    Object.entries(query).filter(([key]) => key !== 'cursor' && key !== 'limit'),
  );
  return normalizeTaskQuery({ ...scope, limit: 200 });
}
export function taskDatasetKey(workspaceId: string, query: TaskQuery) {
  return [
    ...queryKeys.workspace(workspaceId),
    'tasks',
    'complete-view',
    taskDatasetQuery(query),
  ] as const;
}
