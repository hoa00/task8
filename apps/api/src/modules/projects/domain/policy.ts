import type { EntityId, MemberDto, ProjectDto } from '@studio/contracts/api';
export interface ProjectGrant {
  memberId: EntityId;
  permission: 'view' | 'edit';
}
export interface ProjectAccessInput {
  visibility: ProjectDto['visibility'];
  memberId: EntityId;
  grants: readonly ProjectGrant[];
}
export function canAccessProject(input: ProjectAccessInput, mode: 'read' | 'write'): boolean {
  return (
    input.visibility === 'workspace' ||
    input.grants.some(
      (grant) =>
        grant.memberId === input.memberId && (mode === 'read' || grant.permission === 'edit'),
    )
  );
}
export type ActorMode = 'active' | 'administrator' | 'creator';
export interface ActorPolicyInput {
  role: MemberDto['role'];
  status: MemberDto['status'];
  removed: boolean;
}
export function canAct(member: ActorPolicyInput, mode: ActorMode): boolean {
  return (
    member.status === 'active' &&
    !member.removed &&
    (mode === 'active' ||
      (mode === 'administrator' && ['Owner', 'Admin'].includes(member.role)) ||
      (mode === 'creator' && member.role !== 'Guest'))
  );
}
