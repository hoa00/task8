import type { MemberDto } from '@studio/contracts/api';
import { ApiFailure } from '../../../shared/errors.ts';
import { canAct } from './policy.ts';
// The current MemberDto comes from trusted active/nonremoved membership resolution.
export function administrator(member: MemberDto) {
  if (!canAct({ ...member, removed: false }, 'administrator'))
    throw new ApiFailure('FORBIDDEN', 'Workspace administrator required');
}
export function creator(member: MemberDto) {
  if (!canAct({ ...member, removed: false }, 'creator'))
    throw new ApiFailure('FORBIDDEN', 'Guests cannot create projects');
}
