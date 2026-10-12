import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export function listProjectsReadProjects(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ id: string; archivedAt: number | null }>(
    'SELECT id,archivedAt FROM projects WHERE workspaceId=? AND deletedAt IS NULL',
    [s.workspaceId],
  );
}
export function listProjectMembersReadProjectMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string & z.core.$brand<'EntityId'>,
) {
  return r.all<{ memberId: string; permission: string }>(
    'SELECT memberId,permission FROM projectMembers WHERE workspaceId=? AND projectId=? ORDER BY memberId',
    [s.workspaceId, id],
  );
}
