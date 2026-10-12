import type { NotificationQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { notifications } from '../../../db/schema.ts';
import { historySeek } from '../../../db/history-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { required } from '../../../shared/errors.ts';
import { notificationFrom, notificationVisible, parameters } from './visibility.ts';
export async function pagedNotifications(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof NotificationQuerySchema>,
  cursor: CursorPayload | null,
): Promise<{ rows: (typeof notifications.$inferSelect)[]; total: number; unreadCount: number }> {
  const filters = ['1'];
  const filterParameters: string[] = [];
  if (query.category !== 'all') {
    filters.push('n.type=?');
    filterParameters.push(query.category);
  }
  if (query.unreadOnly) filters.push('n.readAt IS NULL');
  const selected = filters.join(' AND ');
  const counts = required(
    (
      await repository.all<{ total: number; unreadCount: number }>(
        `SELECT coalesce(sum(CASE WHEN ${selected} THEN 1 ELSE 0 END),0) total,coalesce(sum(n.readAt IS NULL),0) unreadCount FROM ${notificationFrom} WHERE ${notificationVisible}`,
        [...filterParameters, ...parameters(scope)],
      )
    )[0],
    'Missing notification counts',
  );
  const seek = cursor
    ? historySeek('n.createdAt', 'n.id', cursor, 'desc')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<typeof notifications.$inferSelect>(
    `SELECT n.* FROM ${notificationFrom} WHERE ${notificationVisible} AND ${selected} AND ${seek.sql} ORDER BY n.createdAt DESC,n.id DESC LIMIT ?`,
    [...parameters(scope), ...filterParameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, ...counts };
}
