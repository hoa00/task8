import type { WorkspaceContext } from '../../../shared/scope.ts';
import type { ActorMode } from '../domain/policy.ts';
export const actorSql = (mode: ActorMode = 'active') =>
  `EXISTS (SELECT 1 FROM workspaceMembers actor WHERE actor.workspaceId=? AND actor.id=? AND actor.status='active' AND actor.removedAt IS NULL${mode === 'administrator' ? " AND actor.role IN ('Owner','Admin')" : mode === 'creator' ? " AND actor.role!='Guest'" : ''})`;
export const actorParameters = (scope: WorkspaceContext) => [scope.workspaceId, scope.memberId];
