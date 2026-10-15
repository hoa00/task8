import {
  NotificationQuerySchema,
  NotificationsPageSchema,
  NotificationSchema,
} from '@studio/contracts/api';
import type { NotificationDto, OperationId } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { canReadMockProject } from './project-access.ts';
import { StudioApiError } from '../errors.ts';

export const notificationOperations = [
  'listNotifications',
  'updateNotification',
  'readAllNotifications',
] as const satisfies readonly OperationId[];

// This recipient projection also owns bootstrap badges. Keep parent checks here
// so list/count/mutation never expose a private or deleted child's notification.
export function visibleNotifications(data: MockDataset): NotificationDto[] {
  return Object.values(data.notifications).filter((row) => {
    if (row.workspaceId !== data.workspaceId || row.recipientId !== data.currentMemberId)
      return false;
    const task = row.taskId ? data.tasks[row.taskId] : null;
    if (
      row.taskId &&
      (!task || task.workspaceId !== data.workspaceId || data.taskCommands.deletedTasks[task.id])
    )
      return false;
    if (task && row.projectId && task.projectId !== row.projectId) return false;
    const projectId = task?.projectId ?? row.projectId;
    return !projectId || canReadMockProject(data.projects[projectId], data);
  });
}

export function runNotificationOperation(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
) {
  const rows = visibleNotifications(data);
  if (id === 'readAllNotifications') {
    const unread = rows.filter((row) => !row.readAt);
    unread.forEach((row) => {
      data.notifications[row.id] = { ...row, readAt: clock.now() };
    });
    return { data: { changedCount: unread.length, unreadCount: 0 } };
  }
  if (id === 'updateNotification') {
    const row = rows.find((row) => row.id === input.notificationId);
    if (!row)
      throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    const body = input.body as { read: boolean };
    const updated = NotificationSchema.parse({
      ...row,
      readAt: body.read ? (row.readAt ?? clock.now()) : null,
    });
    data.notifications[row.id] = updated;
    return { data: updated };
  }
  const query = NotificationQuerySchema.parse(input.query);
  const unreadCount = rows.filter((row) => !row.readAt).length;
  const filtered = rows
    .filter(
      (row) =>
        (query.category === 'all' || row.type === query.category) &&
        (!query.unreadOnly || !row.readAt),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const signature = JSON.stringify([
    data.workspaceId,
    data.currentMemberId,
    query.category,
    query.unreadOnly,
  ]);
  let start = 0;
  if (query.cursor) {
    try {
      const value: unknown = JSON.parse(
        atob(query.cursor.replaceAll('-', '+').replaceAll('_', '/')),
      );
      if (
        !value ||
        typeof value !== 'object' ||
        !('scope' in value) ||
        value.scope !== signature ||
        !('id' in value) ||
        typeof value.id !== 'string' ||
        !('at' in value) ||
        typeof value.at !== 'string'
      )
        throw Error('Invalid cursor');
      const at = value.at,
        id = value.id;
      const index = filtered.findIndex(
        (row) => row.createdAt < at || (row.createdAt === at && row.id < id),
      );
      start = index < 0 ? filtered.length : index;
    } catch {
      throw new StudioApiError({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid notification cursor or scope',
          fieldErrors: { cursor: ['Restart notifications.'] },
        },
      });
    }
  }
  const items = filtered.slice(start, start + query.limit),
    last = items.at(-1);
  const nextCursor =
    last && start + items.length < filtered.length
      ? btoa(JSON.stringify({ scope: signature, id: last.id, at: last.createdAt }))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replaceAll('=', '')
      : null;
  return {
    data: NotificationsPageSchema.parse({ items, total: filtered.length, unreadCount, nextCursor }),
  };
}
