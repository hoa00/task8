import { useQuery } from '@tanstack/react-query';
import type { TaskQuery } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { taskDatasetQuery, taskDatasetKey } from './task-dataset-key';
import { loadTaskViewDataset } from './loadTaskViewDataset';
export function useTaskDataset(workspaceId: string, query: TaskQuery, enabled = true) {
  const { client } = useDataRuntime();
  return useQuery({
    enabled,
    queryKey: taskDatasetKey(workspaceId, query),
    queryFn: ({ signal }) =>
      loadTaskViewDataset(client, workspaceId, taskDatasetQuery(query), signal),
  });
}
