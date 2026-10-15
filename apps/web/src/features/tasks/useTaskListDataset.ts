import { useQuery } from '@tanstack/react-query';
import type { TaskDto, TaskQuery } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { queryKeys } from '../../data/query-keys';
export function useTaskListDataset(workspaceId: string, query: TaskQuery) {
  const { client } = useDataRuntime();
  return useQuery<TaskDto[]>({
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceId ? previous : undefined,
    queryKey: [...queryKeys.workspace(workspaceId), 'tasks', 'complete-list', query],
    queryFn: async ({ signal }) => {
      let cursor: string | undefined;
      const unique = new Map<string, TaskDto>();
      do {
        const page = await client.execute(
          'listTasks',
          { workspaceId, query: { ...query, limit: 200, ...(cursor ? { cursor } : {}) } },
          { signal },
        );
        page.data.items.forEach((task) => unique.set(task.id, task));
        cursor = page.data.nextCursor ?? undefined;
      } while (cursor);
      return [...unique.values()];
    },
  });
}
