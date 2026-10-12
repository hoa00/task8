import type { EntityId, WorkspaceDto } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { workspaceDto } from '../mapper.ts';
import { workspaceMemberships } from '../persistence/list.ts';
export async function listWorkspaces(
  r: RequestRepository,
  userId: EntityId,
): Promise<WorkspaceDto[]> {
  return (await workspaceMemberships(r, userId)).map((row) => workspaceDto(row.workspace));
}
