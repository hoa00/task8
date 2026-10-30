import type { EntityId } from '@studio/contracts/api';
export type CommandAuthority =
  | { readonly kind: 'local' | 'ict24h' }
  | {
      readonly kind: 'oidc';
      readonly sessionId: EntityId;
      readonly userId: EntityId;
      readonly issuer: string;
      readonly clientId: string;
    };
export interface WorkspaceContext {
  workspaceId: EntityId;
  memberId: EntityId;
  readonly authority: CommandAuthority;
}
// Authority is server-owned execution context, never cursor/DTO data.
export function createWorkspaceContext(
  workspaceId: EntityId,
  memberId: EntityId,
  authority: CommandAuthority,
): WorkspaceContext {
  const scope: WorkspaceContext = { workspaceId, memberId, authority };
  Object.defineProperty(scope, 'authority', { enumerable: false, writable: false });
  return scope;
}
