import type { EntityId, MemberDto } from '@studio/contracts/api';
import { MemberSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { nullableInstant } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
export async function members(r: RequestRepository, s: WorkspaceContext): Promise<MemberDto[]> {
  const rows = await r.all<Omit<MemberDto, 'lastSeenAt'> & { lastSeenAt: number | null }>(
    `SELECT m.id,m.workspaceId,m.userId,u.name,u.displayEmail email,u.title,u.avatarColor,u.timezone,m.role,m.status,m.teamId,m.lastSeenAt,m.version FROM workspaceMembers m JOIN users u ON u.id=m.userId WHERE m.workspaceId=? AND m.removedAt IS NULL ORDER BY m.id`,
    [s.workspaceId],
  );
  return rows.map((m) => MemberSchema.parse({ ...m, lastSeenAt: nullableInstant(m.lastSeenAt) }));
}
export async function member(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  const row = (await members(r, s)).find((m) => m.id === id);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Member not found');
  return row;
}
