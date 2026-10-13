import type { EntityId, WorkspaceDto } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { workspaceDto } from '../mapper.ts';
import { workspaceMemberships, firstWorkspaceMembership } from '../persistence/list.ts';
import { EntityIdSchema } from '@studio/contracts/api';
export async function listWorkspaces(
  r: RequestRepository,
  userId: EntityId,
): Promise<WorkspaceDto[]> {
  return (await workspaceMemberships(r, userId)).map((row) => workspaceDto(row.workspace));
}
export async function defaultWorkspaceId(
  r: RequestRepository,
  userId: EntityId,
): Promise<EntityId | null> {
  const [row] = await firstWorkspaceMembership(r, userId);
  return row ? EntityIdSchema.parse(row.id) : null;
}
