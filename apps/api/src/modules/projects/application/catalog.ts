import type { ProjectListItemDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { projectCatalogReadProjects } from '../persistence/catalog.ts';
import { projectCatalogForIds } from './scoped-catalog.ts';
export async function projectCatalog(
  repository: RequestRepository,
  scope: WorkspaceContext,
  now: number,
): Promise<ProjectListItemDto[]> {
  const roots = await projectCatalogReadProjects(repository, false, scope);
  const items = await projectCatalogForIds(
    repository,
    scope,
    now,
    roots.map((root) => root.id),
  );
  const byId = new Map<string, ProjectListItemDto>(items.map((item) => [item.project.id, item]));
  return roots.flatMap((root) => {
    const item = byId.get(root.id);
    return item ? [item] : [];
  });
}
