import type { EntityId, MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { memberDto } from '../mapper.ts';
import {
  memberReadWorkspaceMember,
  membersReadWorkspaceMembers,
} from '../persistence/directory.ts';
export async function members(r: RequestRepository, s: WorkspaceContext): Promise<MemberDto[]> {
  const rows = await membersReadWorkspaceMembers(r, s);
  return rows.map((m) => memberDto(m));
}
export async function member(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  const [row] = await memberReadWorkspaceMember(r, s, id);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Member not found');
  return memberDto(row);
}
