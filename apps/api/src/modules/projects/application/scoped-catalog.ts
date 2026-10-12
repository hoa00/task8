import type { ProjectListItemDto } from '@studio/contracts/api';
import { ProjectSummarySchema, VisibilitySchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { required } from '../../../shared/errors.ts';
import { today } from '../../workspaces/index.ts';
import { taskSummaryFromGroups } from '../../tasks/projections.ts';
import { canAccessProject } from '../access.ts';
import { grantProjection, projectProjection, restrictedProjectProjection } from '../mapper.ts';
import { scopedCatalog } from '../persistence/scoped-catalog.ts';
export async function projectCatalogForIds(
  repository: RequestRepository,
  scope: WorkspaceContext,
  now: number,
  ids: readonly string[],
): Promise<ProjectListItemDto[]> {
  if (!ids.length) return [];
  const data = await scopedCatalog(repository, scope, ids, await today(repository, scope, now));
  return data.rows.map((project) => {
    const grants = data.grants.filter((grant) => grant.projectId === project.id);
    if (
      !canAccessProject(
        {
          visibility: VisibilitySchema.parse(project.visibility),
          memberId: scope.memberId,
          grants: grants.map(grantProjection),
        },
        'read',
      )
    )
      return {
        access: 'restricted',
        project: restrictedProjectProjection(
          project,
          required(
            data.leads.find((lead) => lead.id === project.leadId),
            'Missing project lead',
          ),
        ),
      };
    const taskSummary = taskSummaryFromGroups(
      data.groups.filter((group) => group.projectId === project.id),
    );
    return {
      access: 'allowed',
      project: projectProjection(project, {
        memberIds: grants.map((grant) => grant.memberId),
        milestones: data.milestones.filter((milestone) => milestone.projectId === project.id),
        isFavorite: data.favorites.some((favorite) => favorite.projectId === project.id),
      }),
      summary: ProjectSummarySchema.parse({
        projectId: project.id,
        taskSummary,
        progress: taskSummary.completionRate,
      }),
    };
  });
}
