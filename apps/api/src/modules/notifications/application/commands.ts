import type { EntityId, NotificationQuerySchema } from '@studio/contracts/api';
import { NotificationSchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { notifications } from '../../../db/schema.ts';
import { instant, nullableInstant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { pagedNotifications } from '../persistence/paged-notifications.ts';
import {
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
  const { binding, cursor } = await bindReadCursor(
    query,
    { scope: s, kind: 'notifications', category: query.category, unreadOnly: query.unreadOnly },
    'updated',
    'desc',
  );
  const { rows, total, unreadCount } = await pagedNotifications(r, s, query, cursor);
  return {
    ...finishReadPage(rows.map(dto), total, query.limit, binding, (row) => ({
      id: row.id,
      value: row.createdAt,
    })),
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
