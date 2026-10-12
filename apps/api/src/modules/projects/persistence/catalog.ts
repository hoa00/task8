import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql as accessSql } from '../access.ts';
import type { ProjectRow } from './model.ts';

export function projectCatalogReadProjects(
  r: RequestRepository,
  includeDeleted: boolean,
  s: WorkspaceContext,
) {
  return r.all<ProjectRow>(
    'SELECT * FROM projects WHERE workspaceId=?' +
      (includeDeleted ? '' : ' AND deletedAt IS NULL') +
      ' ORDER BY id',
    [s.workspaceId],
  );
}
export function projectCatalogReadProjectMembers(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ projectId: string; memberId: string; permission: string }>(
    'SELECT * FROM projectMembers WHERE workspaceId=?',
    [s.workspaceId],
  );
}
export function projectCatalogReadProjectMilestones(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{
    id: string;
    workspaceId: string;
    projectId: string;
    name: string;
    date: string;
    position: number;
  }>(
    `SELECT m.* FROM projectMilestones m JOIN projects p ON p.workspaceId=m.workspaceId AND p.id=m.projectId WHERE m.workspaceId=? AND p.deletedAt IS NULL AND ${accessSql} ORDER BY m.position,m.id`,
    [s.workspaceId, s.memberId],
  );
}
export function projectCatalogReadProjectFavorites(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ projectId: string }>(
    'SELECT projectId FROM projectFavorites WHERE workspaceId=? AND memberId=?',
    [s.workspaceId, s.memberId],
  );
}
export function projectCatalogReadSubtasks(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ taskId: string; total: number; completed: number }>(
    `SELECT c.taskId,count(*) total,sum(c.done) completed FROM subtasks c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE c.workspaceId=? AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND t.deletedAt IS NULL AND t.archivedAt IS NULL AND ${accessSql} GROUP BY c.taskId`,
    [s.workspaceId, s.memberId],
  );
}
