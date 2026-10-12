import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { historySeek } from '../../../db/history-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { required } from '../../../shared/errors.ts';
import { readAccessSql } from '../../projects/access.ts';
import type { CommentRow } from './commands-model.ts';
export type CommentPageProjection = CommentRow & { reactionsJson: string };
export async function pagedComments(
  repository: RequestRepository,
  scope: WorkspaceContext,
  taskId: string,
  limit: number,
  cursor: CursorPayload | null,
): Promise<{ rows: CommentPageProjection[]; total: number }> {
  const predicate = `c.workspaceId=? AND c.taskId=? AND c.deletedAt IS NULL AND EXISTS (SELECT 1 FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=c.workspaceId AND t.id=c.taskId AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql})`;
  const parameters = [scope.workspaceId, taskId, scope.memberId];
  const count = required(
    (
      await repository.all<{ total: number }>(
        `SELECT count(*) total FROM comments c WHERE ${predicate}`,
        parameters,
      )
    )[0],
    'Missing comment count',
  );
  const seek = cursor
    ? historySeek('c.createdAt', 'c.id', cursor, 'asc')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<CommentPageProjection>(
    `SELECT c.*,(SELECT json_group_array(json_object('key',reactionKey,'memberId',memberId)) FROM (SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=c.workspaceId AND commentId=c.id ORDER BY reactionKey,memberId)) reactionsJson FROM comments c WHERE ${predicate} AND ${seek.sql} ORDER BY c.createdAt,c.id LIMIT ?`,
    [...parameters, ...seek.parameters, limit + 1],
  );
  return { rows, total: count.total };
}
