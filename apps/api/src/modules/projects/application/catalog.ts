import type { ProjectListItemDto } from '@studio/contracts/api';
import {
  PrioritySchema,
  ProjectSummarySchema,
  TaskStatusSchema,
  VisibilitySchema,
} from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { members } from '../../members/projections.ts';
import { activeTasks } from '../../tasks/projections.ts';
import { today } from '../../workspaces/index.ts';
import { canAccessProject, grantProjection } from '../access.ts';
import { projectProjection, restrictedProjectProjection } from '../mapper.ts';
import {
  projectCatalogReadProjectFavorites,
  projectCatalogReadProjectMembers,
  projectCatalogReadProjectMilestones,
  projectCatalogReadProjects,
  projectCatalogReadSubtasks,
} from '../persistence/catalog.ts';
export async function projectCatalog(
  r: RequestRepository,
  s: WorkspaceContext,
  now: number,
  includeDeleted = false,
): Promise<ProjectListItemDto[]> {
  const rows = await projectCatalogReadProjects(r, includeDeleted, s);
  const grants = await projectCatalogReadProjectMembers(r, s);
  const memberRows = await members(r, s);
  const milestones = await projectCatalogReadProjectMilestones(r, s);
  const favorites = await projectCatalogReadProjectFavorites(r, s);
  const taskRows = await activeTasks(r, s),
    date = await today(r, s, now);
  const children = await projectCatalogReadSubtasks(r, s);
  return rows.map((p) => {
    if (
      !canAccessProject(
        {
          visibility: VisibilitySchema.parse(p.visibility),
          memberId: s.memberId,
          grants: grants.filter((g) => g.projectId === p.id).map(grantProjection),
        },
        'read',
      )
    ) {
      const lead = memberRows.find((m) => m.id === p.leadId);
      if (!lead) throw new ApiFailure('INTERNAL_ERROR', 'Missing project lead');
      return {
        access: 'restricted',
        project: restrictedProjectProjection(p, lead),
      };
    }
    const ts = taskRows.filter((t) => t.projectId === p.id),
      total = ts.length;
    const byStatus = { backlog: 0, todo: 0, progress: 0, review: 0, done: 0 },
      byPriority = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
    for (const t of ts) {
      byStatus[TaskStatusSchema.parse(t.status)]++;
      byPriority[PrioritySchema.parse(t.priority)]++;
    }
    const subtaskTotals = children
      .filter((c) => ts.some((t) => t.id === c.taskId))
      .reduce(
        (sum, c) => ({ total: sum.total + c.total, completed: sum.completed + c.completed }),
        { total: 0, completed: 0 },
      );
    const taskSummary = {
      total,
      byStatus,
      byPriority,
      completed: byStatus.done,
      completionRate: total ? Math.round((byStatus.done / total) * 100) : 0,
      overdue: ts.filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate < date)
        .length,
      subtaskTotals,
    };
    return {
      access: 'allowed',
      project: projectProjection(p, {
        memberIds: grants.filter((g) => g.projectId === p.id).map((g) => g.memberId),
        milestones: milestones.filter((m) => m.projectId === p.id),
        isFavorite: favorites.some((f) => f.projectId === p.id),
      }),
      summary: ProjectSummarySchema.parse({
        projectId: p.id,
        taskSummary,
        progress: taskSummary.completionRate,
      }),
    };
  });
}
