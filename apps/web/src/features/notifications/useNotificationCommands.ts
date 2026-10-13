import { captureIntent } from '../../data/operations';
import type { StudioClient } from '../../data/operations';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, OperationOutput } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { invalidateOperation } from '../../data/invalidation';
import { queryKeys } from '../../data/query-keys';

interface NotificationReadIntent { kind: 'one'; notification: NotificationDto; read: boolean }
interface NotificationReadAllIntent { kind: 'all' }
type Intent = (NotificationReadIntent | NotificationReadAllIntent) & {intentClient:StudioClient};
interface NotificationRecords { records: NotificationDto[]; unreadCount: number }
export function useNotificationCommands(workspaceId: string) {
  const { client, clock } = useDataRuntime(), cache = useQueryClient(), busy = useRef(false), [error, setError] = useState('');
  const key = [...queryKeys.workspace(workspaceId), 'notifications', 'all-records'], bootstrapKey = queryKeys.bootstrap(workspaceId);
  const mutation = useMutation({
    mutationFn: async (intent: Intent): Promise<OperationOutput<'readAllNotifications'> | OperationOutput<'updateNotification'>> => intent.kind === 'all' ? intent.intentClient.api.readAllNotifications({ workspaceId }) : intent.intentClient.api.updateNotification({ workspaceId, notificationId: intent.notification.id, body: { read: intent.read } }),
    onMutate: async intent => {
      await Promise.all([cache.cancelQueries({ queryKey: key }), cache.cancelQueries({ queryKey: bootstrapKey })]);
      intent.intentClient.assertIntent?.();
      const before = cache.getQueryData<NotificationRecords>(key), bootstrapBefore = cache.getQueryData<OperationOutput<'getBootstrap'>>(bootstrapKey);
      const records = before?.records.map(row => intent.kind === 'all' || row.id === intent.notification.id ? { ...row, readAt: intent.kind === 'all' || intent.read ? row.readAt ?? clock.now() : null } : row);
      const optimistic = records ? { records, unreadCount: records.filter(row => !row.readAt).length } : undefined;
      if (optimistic) cache.setQueryData(key, optimistic);
      const bootstrapOptimistic = optimistic && bootstrapBefore ? { ...bootstrapBefore, data: { ...bootstrapBefore.data, unreadCount: optimistic.unreadCount, navigationCounts: { ...bootstrapBefore.data.navigationCounts, inbox: optimistic.records.filter(row => !row.readAt && row.type !== 'update').length } } } : undefined;
      if (bootstrapOptimistic) cache.setQueryData(bootstrapKey, bootstrapOptimistic);
      return { before, optimistic: cache.getQueryData(key), bootstrapBefore, bootstrapOptimistic: cache.getQueryData(bootstrapKey) };
    },
    onError: (_cause, _intent, rollback) => {
      if (rollback?.before && cache.getQueryData(key) === rollback.optimistic) cache.setQueryData(key, rollback.before);
      if (rollback?.bootstrapBefore && cache.getQueryData(bootstrapKey) === rollback.bootstrapOptimistic) cache.setQueryData(bootstrapKey, rollback.bootstrapBefore);
    },
    onSettled: async (_result, _cause, intent) => {
      if (intent.kind === 'all') await invalidateOperation(cache, 'readAllNotifications', { workspaceId });
      else await invalidateOperation(cache, 'updateNotification', { workspaceId, notificationId: intent.notification.id, body: { read: intent.read } });
    },
  });
  async function run(intent: NotificationReadIntent | NotificationReadAllIntent) {
    if (busy.current) return false;
    busy.current = true; setError('');
    try { await mutation.mutateAsync({...intent,intentClient:captureIntent(client)}); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Read state could not be saved'); return false; }
    finally { busy.current = false; }
  }
  return { pending: mutation.isPending, error, read: (notification: NotificationDto, read: boolean) => run({ kind: 'one', notification, read }), readAll: () => run({ kind: 'all' }) };
}
