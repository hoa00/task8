import { useQueries, useQuery } from '@tanstack/react-query';
import type { NotificationDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { queryKeys } from '../../data/query-keys';
import { studioQueryOptions } from '../../data/queries';

export function useNotifications(workspaceId: string) {
  const { client } = useDataRuntime();
  const query = useQuery({ queryKey: [...queryKeys.workspace(workspaceId), 'notifications', 'all-records'], queryFn: async ({ signal }) => {
    const rows = new Map<string, NotificationDto>(), cursors = new Set<string>();
    let cursor: string | undefined, unreadCount: number;
    do {
      const page = (await client.execute('listNotifications', { workspaceId, query: { limit: 200, ...(cursor ? { cursor } : {}) } }, { signal })).data;
      page.items.forEach(row => rows.set(row.id, row)); unreadCount = page.unreadCount; cursor = page.nextCursor ?? undefined;
      if (cursor) { if (cursors.has(cursor)) throw Error('Notification cursor did not advance'); cursors.add(cursor); }
      else if (rows.size !== page.total) throw Error('Notifications changed while loading. Retry.');
    } while (cursor);
    return { records: [...rows.values()], unreadCount };
  } });
  const taskIds = [...new Set(query.data?.records.flatMap(row => row.taskId ? [row.taskId] : []) ?? [])];
  const tasks = useQueries({ queries: taskIds.map(taskId => studioQueryOptions(client, 'getTask', { workspaceId, taskId })) });
  const error = query.error ?? tasks.find(row => row.error)?.error;
  return { query, records: query.data?.records ?? [], tasks: tasks.flatMap(row => row.data ? [row.data.data.task] : []), pending: query.isPending || tasks.some(row => row.isPending), error,
    retry: () => { void query.refetch(); tasks.forEach(row => { if (row.error) void row.refetch(); }); } };
}
