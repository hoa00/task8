import type { TaskQuery } from '@studio/contracts/api';
import { useTaskDataset } from './useTaskDataset';
export function useTaskListDataset(workspaceId: string, query: TaskQuery, enabled = true) {
  const result = useTaskDataset(workspaceId, query, enabled);
  return { ...result, data: result.data?.items };
}
