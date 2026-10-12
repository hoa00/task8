// Test-only complete read sets for independent domain/comparator parity against current SQL pages.
import type { z, $brand } from 'zod';
import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../src/db/client.ts';
import type { files, comments, activity, notifications } from '../../src/db/schema.ts';
import { readAccessSql as accessSql } from '../../src/modules/projects/access.ts';
import { taskSelect } from '../../src/modules/tasks/index.ts';
import type { TaskProjection } from '../../src/modules/tasks/projections.ts';
import {
  notificationFrom,
  notificationVisible,
} from '../../src/modules/notifications/visibility.ts';
type FileRow = Omit<typeof files.$inferSelect, 'readKeys'>;
type CommentRow = Omit<typeof comments.$inferSelect, 'readKeys' | 'mentionedMemberIdsJson'> & {
  mentionedMemberIdsJson: string;
};
const parameters = (scope: WorkspaceContext) => [scope.workspaceId, scope.memberId, scope.memberId];
export function archiveRead(r: RequestRepository, s: WorkspaceContext) {
  return r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.archivedAt IS NOT NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,
    [s.memberId, s.memberId, s.workspaceId, s.memberId],
  );
}
export function archiveReadProjects(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ id: string; rank: number }>(
    `SELECT p.id,p.rowid rank FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql} ORDER BY p.rowid`,
    [s.workspaceId, s.memberId],
  );
}
export function archiveReadResult(r: RequestRepository, s: WorkspaceContext) {
  return r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.deletedAt IS NULL AND p.archivedAt IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql}`,
    [s.memberId, s.memberId, s.workspaceId, s.memberId],
  );
}
export function searchReadFiles(r: RequestRepository, s: WorkspaceContext) {
  return r.all<typeof files.$inferSelect>(
    `SELECT f.* FROM files f JOIN projects p ON p.workspaceId=f.workspaceId AND p.id=f.projectId LEFT JOIN tasks t ON t.workspaceId=f.workspaceId AND t.id=f.taskId WHERE f.workspaceId=? AND f.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} AND (f.taskId IS NULL OR (t.id IS NOT NULL AND t.projectId=f.projectId AND t.archivedAt IS NULL AND t.deletedAt IS NULL))`,
    [s.workspaceId, s.memberId],
  );
}
export function searchReadCommentReactions(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{
    id: string;
    workspaceId: string;
    taskId: string;
    authorId: string;
    bodyText: string;
    mentionedMemberIdsJson: string;
    createdAt: number;
    version: number;
    reactionsJson: string;
  }>(
    `SELECT c.*,(SELECT json_group_array(json_object('key',reactionKey,'memberId',memberId)) FROM (SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=c.workspaceId AND commentId=c.id ORDER BY reactionKey,memberId)) reactionsJson FROM comments c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE c.workspaceId=? AND c.deletedAt IS NULL AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,
    [s.workspaceId, s.memberId],
  );
}
export function listActivityReadActivity(
  r: RequestRepository,
  query: {
    limit: number;
    cursor?: string | undefined;
    projectId?: (string & z.core.$brand<'EntityId'>) | undefined;
    taskId?: (string & z.core.$brand<'EntityId'>) | undefined;
    actorId?: (string & z.core.$brand<'EntityId'>) | undefined;
  },
  s: WorkspaceContext,
) {
  return r.all<typeof activity.$inferSelect>(
    `SELECT a.* FROM activity a
    LEFT JOIN tasks t ON t.workspaceId=a.workspaceId AND t.id=a.taskId
    LEFT JOIN projects p ON p.workspaceId=a.workspaceId AND p.id=coalesce(t.projectId,a.projectId)
    WHERE a.workspaceId=? AND a.revertedAt IS NULL
    AND (a.actorId IS NULL OR EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=a.workspaceId AND m.id=a.actorId AND m.removedAt IS NULL))
    AND (a.taskId IS NULL OR (t.id IS NOT NULL AND t.deletedAt IS NULL AND (a.projectId IS NULL OR a.projectId=t.projectId)))
    AND (coalesce(t.projectId,a.projectId) IS NULL OR (p.id IS NOT NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}))
    ${query.projectId ? 'AND coalesce(t.projectId,a.projectId)=?' : ''} ${query.taskId ? 'AND a.taskId=?' : ''} ${query.actorId ? 'AND a.actorId=?' : ''}
    ORDER BY a.createdAt DESC,a.id DESC`,
    [
      s.workspaceId,
      s.memberId,
      ...(query.projectId ? [query.projectId] : []),
      ...(query.taskId ? [query.taskId] : []),
      ...(query.actorId ? [query.actorId] : []),
    ],
  );
}
export function listFilesReadFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string & $brand<'EntityId'>,
) {
  return r.all<FileRow>(
    `SELECT f.* FROM files f WHERE f.workspaceId=? AND f.projectId=? AND f.deletedAt IS NULL AND (f.taskId IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.workspaceId=f.workspaceId AND t.id=f.taskId AND t.projectId=f.projectId AND t.deletedAt IS NULL AND t.archivedAt IS NULL))`,
    [s.workspaceId, id],
  );
}
export function listNotificationsRead(r: RequestRepository, s: WorkspaceContext) {
  return r.all<typeof notifications.$inferSelect>(
    `SELECT n.* FROM ${notificationFrom} WHERE ${notificationVisible} ORDER BY n.createdAt DESC,n.id DESC`,
    parameters(s),
  );
}
export function listCommentsReadCommentReactions(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.all<CommentRow & { reactionsJson: string }>(
    `SELECT c.*,(SELECT json_group_array(json_object('key',reactionKey,'memberId',memberId)) FROM (SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=c.workspaceId AND commentId=c.id ORDER BY reactionKey,memberId)) reactionsJson FROM comments c WHERE c.workspaceId=? AND c.taskId=? AND c.deletedAt IS NULL ORDER BY c.createdAt,c.id`,
    [s.workspaceId, id],
  );
}
