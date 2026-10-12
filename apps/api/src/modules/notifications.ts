import type { EntityId, NotificationQuerySchema } from '@studio/contracts/api';
import { NotificationSchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../db/client.ts';
import type { notifications } from '../db/schema.ts';
import { instant, nullableInstant } from '../shared/clock.ts';
import { ApiFailure } from '../shared/errors.ts';
import { historyPage } from './collaboration-page.ts';
import { readAccessSql as accessSql, actorParameters, actorSql } from './projects/index.ts';
// Shared recipient/current-parent policy owns list, mutations and Bootstrap badges.
export const notificationFrom = `notifications n LEFT JOIN tasks t ON t.workspaceId=n.workspaceId AND t.id=n.taskId LEFT JOIN projects p ON p.workspaceId=n.workspaceId AND p.id=coalesce(t.projectId,n.projectId)`;
export const notificationVisible = `n.workspaceId=? AND n.recipientId=? AND (n.taskId IS NULL OR (t.id IS NOT NULL AND t.deletedAt IS NULL AND (n.projectId IS NULL OR n.projectId=t.projectId))) AND ((n.projectId IS NULL AND n.taskId IS NULL) OR (p.id IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql}))`;
const parameters = (s: WorkspaceContext) => [s.workspaceId, s.memberId, s.memberId];
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
  const rows = await r.all<typeof notifications.$inferSelect>(
    `SELECT n.* FROM ${notificationFrom} WHERE ${notificationVisible} ORDER BY n.createdAt DESC,n.id DESC`,
    parameters(s),
  );
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
  const eligible = `id IN (SELECT n.id FROM ${notificationFrom} WHERE ${notificationVisible} AND n.id=?) AND ${actorSql()}`;
  const results = await r.batch([
    r.prepare(
      `UPDATE notifications SET readAt=${read ? 'coalesce(readAt,?)' : 'NULL'} WHERE ${eligible}`,
      [...(read ? [now] : []), ...parameters(s), id, ...actorParameters(s)],
    ),
    r.prepare(
      `SELECT n.*,${actorSql()} authorized FROM ${notificationFrom} WHERE ${notificationVisible} AND n.id=?`,
      [...actorParameters(s), ...parameters(s), id],
    ),
  ]);
  const row = results[1]!.results[0] as
    | (typeof notifications.$inferSelect & { authorized: number })
    | undefined;
  if (!row) throw new ApiFailure('NOT_FOUND', 'Notification not found');
  if (!row.authorized || results[0]!.meta.changes !== 1)
    throw new ApiFailure('CONFLICT', 'Notification authorization changed');
  return dto(row);
}
export async function readAllNotifications(r: RequestRepository, s: WorkspaceContext, now: number) {
  const results = await r.batch([
    r.prepare(
      `UPDATE notifications SET readAt=? WHERE readAt IS NULL AND id IN (SELECT n.id FROM ${notificationFrom} WHERE ${notificationVisible}) AND ${actorSql()}`,
      [now, ...parameters(s), ...actorParameters(s)],
    ),
    r.prepare(
      `SELECT count(*) unreadCount,${actorSql()} authorized FROM ${notificationFrom} WHERE ${notificationVisible} AND n.readAt IS NULL`,
      [...actorParameters(s), ...parameters(s)],
    ),
  ]);
  const current = results[1]!.results[0] as { unreadCount: number; authorized: number };
  if (!current.authorized) throw new ApiFailure('CONFLICT', 'Notification membership changed');
  return { changedCount: results[0]!.meta.changes, unreadCount: current.unreadCount };
}
