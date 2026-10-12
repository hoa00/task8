import { EntityIdSchema } from '@studio/contracts/api';
import { ApiFailure } from '../../shared/errors.ts';
import type { ProjectGrant } from './domain/policy.ts';
export interface GrantProjection {
  memberId: string;
  permission: string;
}
export function grantProjection(row: GrantProjection): ProjectGrant {
  if (row.permission !== 'view' && row.permission !== 'edit')
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid project grant projection');
  return { memberId: EntityIdSchema.parse(row.memberId), permission: row.permission };
}
