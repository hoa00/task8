import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export function projectCatalogReadProjects(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ id: string }>(
    'SELECT id FROM projects WHERE workspaceId=? AND deletedAt IS NULL ORDER BY id',
    [s.workspaceId],
  );
}
