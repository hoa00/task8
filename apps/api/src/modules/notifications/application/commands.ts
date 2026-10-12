import type { EntityId, NotificationQuerySchema } from '@studio/contracts/api';
import { NotificationSchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { notifications } from '../../../db/schema.ts';
import { instant, nullableInstant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import { historyPage } from '../../collaboration-page.ts';
import {
  listNotificationsRead,
  readAllNotificationsCommitNotifications,
  updateNotificationCommitNotifications,
  updateNotificationPredicate,
} from '../persistence/commands.ts';

const dto = (row: typeof notifications.$inferSelect) =>
  NotificationSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    recipientId: row.recipientId,
    actorId: row.actorId,
    projectId: row.projectId,
    taskId: row.taskId,
    type: row.type,
    text: row.text,
    snippet: row.snippet,
    createdAt: instant(row.createdAt),
    readAt: nullableInstant(row.readAt),
  });
export async function listNotifications(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof NotificationQuerySchema>,
) {
  const rows = await listNotificationsRead(r, s);
  const unreadCount = rows.filter((n) => n.readAt === null).length,
    items = rows
      .filter(
        (n) =>
          (query.category === 'all' || n.type === query.category) &&
          (!query.unreadOnly || n.readAt === null),
      )
      .map(dto);
  return {
    ...(await historyPage(
      items,
      query,
      { scope: s, kind: 'notifications', category: query.category, unreadOnly: query.unreadOnly },
      true,
    )),
    unreadCount,
  };
}
export async function updateNotification(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  read: boolean,
  now: number,
) {
  const eligible = updateNotificationPredicate();
  const results = await updateNotificationCommitNotifications(r, read, eligible, now, s, id);
  const row = required(results[1], 'Missing notifications state').results[0];
  if (!row) throw new ApiFailure('NOT_FOUND', 'Notification not found');
  if (!row.authorized || required(results[0], 'Missing notifications state').meta.changes !== 1)
    throw new ApiFailure('CONFLICT', 'Notification authorization changed');
  return dto(row);
}
export async function readAllNotifications(r: RequestRepository, s: WorkspaceContext, now: number) {
  const results = await readAllNotificationsCommitNotifications(r, now, s);
  const current = required(
    required(results[1], 'Missing notifications state').results[0],
    'Missing notification aggregate',
  );
  if (!current.authorized) throw new ApiFailure('CONFLICT', 'Notification membership changed');
  return {
    changedCount: required(results[0], 'Missing notifications state').meta.changes,
    unreadCount: current.unreadCount,
  };
}
