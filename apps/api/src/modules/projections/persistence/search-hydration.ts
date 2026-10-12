import type { MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { files, comments } from '../../../db/schema.ts';
import { readAccessSql } from '../../projects/access.ts';
export function searchPeople(
  repository: RequestRepository,
  scope: WorkspaceContext,
  ids: readonly string[],
) {
  return repository.all<Omit<MemberDto, 'lastSeenAt'> & { lastSeenAt: number | null }>(
    `SELECT m.id,m.workspaceId,m.userId,u.name,u.displayEmail email,u.title,u.avatarColor,u.timezone,m.role,m.status,m.teamId,m.lastSeenAt,m.version FROM workspaceMembers m JOIN users u ON u.id=m.userId WHERE m.workspaceId=? AND m.removedAt IS NULL AND m.id IN (SELECT value FROM json_each(?))`,
    [scope.workspaceId, JSON.stringify(ids)],
  );
}
export function searchFiles(
  repository: RequestRepository,
  scope: WorkspaceContext,
  ids: readonly string[],
) {
  return repository.all<typeof files.$inferSelect>(
    `SELECT f.* FROM files f JOIN projects p ON p.workspaceId=f.workspaceId AND p.id=f.projectId LEFT JOIN tasks t ON t.workspaceId=f.workspaceId AND t.id=f.taskId WHERE f.workspaceId=? AND f.id IN (SELECT value FROM json_each(?)) AND f.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} AND (f.taskId IS NULL OR (t.id IS NOT NULL AND t.projectId=f.projectId AND t.archivedAt IS NULL AND t.deletedAt IS NULL))`,
    [scope.workspaceId, JSON.stringify(ids), scope.memberId],
  );
}
export interface SearchCommentProjection
  extends Omit<typeof comments.$inferSelect, 'readKeys' | 'mentionedMemberIdsJson'> {
  mentionedMemberIdsJson: string;
  reactionsJson: string;
  taskKey: string;
  taskTitle: string;
}
export function searchComments(
  repository: RequestRepository,
  scope: WorkspaceContext,
  ids: readonly string[],
) {
  return repository.all<SearchCommentProjection>(
    `SELECT c.*,p.key||'-'||t.number taskKey,t.title taskTitle,(SELECT json_group_array(json_object('key',reactionKey,'memberId',memberId)) FROM (SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=c.workspaceId AND commentId=c.id ORDER BY reactionKey,memberId)) reactionsJson FROM comments c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE c.workspaceId=? AND c.id IN (SELECT value FROM json_each(?)) AND c.deletedAt IS NULL AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql}`,
    [scope.workspaceId, JSON.stringify(ids), scope.memberId],
  );
}
