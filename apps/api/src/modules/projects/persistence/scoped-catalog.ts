import type { DateOnly } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql } from '../access.ts';
import type { ProjectRow } from './model.ts';
import type { TaskCountGroup } from '../../tasks/projections.ts';
import type { projectMembers, projectMilestones } from '../../../db/schema.ts';
export type CatalogGrant = typeof projectMembers.$inferSelect;
export interface CatalogLead {
  id: string;
  name: string;
  avatarColor: string;
}
export interface ProjectCountGroup extends TaskCountGroup {
  projectId: string;
}
export async function scopedCatalog(
  repository: RequestRepository,
  scope: WorkspaceContext,
  ids: readonly string[],
  date: DateOnly,
) {
  const json = JSON.stringify(ids);
  const rows = await repository.all<ProjectRow>(
    'SELECT * FROM projects WHERE workspaceId=? AND deletedAt IS NULL AND id IN (SELECT value FROM json_each(?))',
    [scope.workspaceId, json],
  );
  const grants = await repository.all<CatalogGrant>(
    'SELECT projectId,memberId,permission FROM projectMembers WHERE workspaceId=? AND projectId IN (SELECT value FROM json_each(?)) ORDER BY rowid',
    [scope.workspaceId, json],
  );
  const milestones = await repository.all<typeof projectMilestones.$inferSelect>(
    `SELECT m.* FROM projectMilestones m JOIN projects p ON p.workspaceId=m.workspaceId AND p.id=m.projectId WHERE m.workspaceId=? AND m.projectId IN (SELECT value FROM json_each(?)) AND p.deletedAt IS NULL AND ${readAccessSql} ORDER BY m.position,m.id`,
    [scope.workspaceId, json, scope.memberId],
  );
  const favorites = await repository.all<{ projectId: string }>(
    'SELECT projectId FROM projectFavorites WHERE workspaceId=? AND memberId=? AND projectId IN (SELECT value FROM json_each(?))',
    [scope.workspaceId, scope.memberId, json],
  );
  const leads = await repository.all<CatalogLead>(
    'SELECT m.id,u.name,u.avatarColor FROM workspaceMembers m JOIN users u ON u.id=m.userId WHERE m.workspaceId=? AND m.removedAt IS NULL AND m.id IN (SELECT leadId FROM projects WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)))',
    [scope.workspaceId, scope.workspaceId, json],
  );
  const groups = await repository.all<ProjectCountGroup>(
    `SELECT t.projectId,t.status,t.priority,count(*) total,sum(t.status!='done' AND t.dueDate IS NOT NULL AND t.dueDate<?) overdue,sum((SELECT count(*) FROM subtasks c WHERE c.workspaceId=t.workspaceId AND c.taskId=t.id)) subtaskTotal,sum((SELECT count(*) FROM subtasks c WHERE c.workspaceId=t.workspaceId AND c.taskId=t.id AND c.done=1)) subtaskCompleted FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.projectId IN (SELECT value FROM json_each(?)) AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} GROUP BY t.projectId,t.status,t.priority`,
    [date, scope.workspaceId, json, scope.memberId],
  );
  return { rows, grants, milestones, favorites, leads, groups };
}
