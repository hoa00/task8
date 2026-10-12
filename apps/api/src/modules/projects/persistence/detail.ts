import type { projectMilestones } from '../../../db/schema.ts';

import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export function projectDtoReadProjectMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  p: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all<{ memberId: string }>(
    'SELECT memberId FROM projectMembers WHERE workspaceId=? AND projectId=? ORDER BY memberId',
    [s.workspaceId, p.id],
  );
}
export function projectDtoReadProjectMilestones(
  r: RequestRepository,
  s: WorkspaceContext,
  p: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all<typeof projectMilestones.$inferSelect>(
    'SELECT * FROM projectMilestones WHERE workspaceId=? AND projectId=? ORDER BY position,id',
    [s.workspaceId, p.id],
  );
}
export function projectDtoReadProjectFavorites(
  r: RequestRepository,
  s: WorkspaceContext,
  p: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all(
    'SELECT 1 FROM projectFavorites WHERE workspaceId=? AND memberId=? AND projectId=?',
    [s.workspaceId, s.memberId, p.id],
  );
}
