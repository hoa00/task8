import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { files } from '../../../db/schema.ts';
import { readAccessSql as accessSql } from '../../projects/access.ts';
import type { TaskProjection } from '../../tasks/index.ts';
import { taskSelect } from '../../tasks/index.ts';

export function calendarRead(
  r: RequestRepository,
  table: 'calendarEvents' | 'projectMilestones',
  query:
    | {
        from: string & z.core.$brand<'DateOnly'>;
        to: string & z.core.$brand<'DateOnly'>;
        projectId?: (string & z.core.$brand<'EntityId'>) | undefined;
      }
    | {
        from?: (string & z.core.$brand<'DateOnly'>) | undefined;
        to?: (string & z.core.$brand<'DateOnly'>) | undefined;
        projectId?: (string & z.core.$brand<'EntityId'>) | undefined;
      },
  milestones: boolean,
  s: WorkspaceContext,
) {
  return r.all(
    `SELECT e.* FROM ${table} e JOIN projects p ON p.workspaceId=e.workspaceId AND p.id=e.projectId WHERE e.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} ${query.projectId ? 'AND e.projectId=?' : ''} ${query.from ? 'AND e.date>=?' : ''} ${query.to ? 'AND e.date<=?' : ''} ORDER BY e.date,${milestones ? 'e.position' : 'e.localTime'},e.id`,
    [
      s.workspaceId,
      s.memberId,
      ...(query.projectId ? [query.projectId] : []),
      ...(query.from ? [query.from] : []),
      ...(query.to ? [query.to] : []),
    ],
  );
}
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
