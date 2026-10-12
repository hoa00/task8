import type { EntityId } from '@studio/contracts/api';
export interface WorkspaceContext {
  workspaceId: EntityId;
  memberId: EntityId;
}
