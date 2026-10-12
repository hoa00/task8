import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { notifications } from '../../../db/schema.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';
import { notificationFrom, notificationVisible, parameters } from './visibility.ts';

export function listNotificationsRead(r: RequestRepository, s: WorkspaceContext) {
  return r.all<typeof notifications.$inferSelect>(
    `SELECT n.* FROM ${notificationFrom} WHERE ${notificationVisible} ORDER BY n.createdAt DESC,n.id DESC`,
    parameters(s),
  );
}
export function updateNotificationPredicate() {
  return `id IN (SELECT n.id FROM ${notificationFrom} WHERE ${notificationVisible} AND n.id=?) AND ${actorSql()}`;
}
export function updateNotificationCommitNotifications(
  r: RequestRepository,
  read: boolean,
  eligible: string,
  now: number,
  s: WorkspaceContext,
  id: string & z.core.$brand<'EntityId'>,
) {
  return r.batch<typeof notifications.$inferSelect & { authorized: number }>([
    r.prepare(
      `UPDATE notifications SET readAt=${read ? 'coalesce(readAt,?)' : 'NULL'} WHERE ${eligible}`,
      [...(read ? [now] : []), ...parameters(s), id, ...actorParameters(s)],
    ),
    r.prepare(
      `SELECT n.*,${actorSql()} authorized FROM ${notificationFrom} WHERE ${notificationVisible} AND n.id=?`,
      [...actorParameters(s), ...parameters(s), id],
    ),
  ]);
}
export function readAllNotificationsCommitNotifications(
  r: RequestRepository,
  now: number,
  s: WorkspaceContext,
) {
  return r.batch<{ unreadCount: number; authorized: number }>([
    r.prepare(
      `UPDATE notifications SET readAt=? WHERE readAt IS NULL AND id IN (SELECT n.id FROM ${notificationFrom} WHERE ${notificationVisible}) AND ${actorSql()}`,
      [now, ...parameters(s), ...actorParameters(s)],
    ),
    r.prepare(
      `SELECT count(*) unreadCount,${actorSql()} authorized FROM ${notificationFrom} WHERE ${notificationVisible} AND n.readAt IS NULL`,
      [...actorParameters(s), ...parameters(s)],
    ),
  ]);
}
