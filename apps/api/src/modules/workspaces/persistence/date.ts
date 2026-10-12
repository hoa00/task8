import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export function todayReadWorkspaces(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ timezone: string }>('SELECT timezone FROM workspaces WHERE id=?', [s.workspaceId]);
}
