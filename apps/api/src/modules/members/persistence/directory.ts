import type { MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export function membersReadWorkspaceMembers(r: RequestRepository, s: WorkspaceContext) {
  return r.all<Omit<MemberDto, 'lastSeenAt'> & { lastSeenAt: number | null }>(
    `SELECT m.id,m.workspaceId,m.userId,u.name,u.displayEmail email,u.title,u.avatarColor,u.timezone,m.role,m.status,m.teamId,m.lastSeenAt,m.version FROM workspaceMembers m JOIN users u ON u.id=m.userId WHERE m.workspaceId=? AND m.removedAt IS NULL ORDER BY m.id`,
    [s.workspaceId],
  );
}
