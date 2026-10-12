import type { EntityId, MemberDto, UpdateWorkspaceInput } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { administrator } from '../../projects/access.ts';
import { workspaceDto } from '../../workspaces/projections.ts';
import {
  readWorkspaceReadWorkspaces,
  updateWorkspaceBudget,
  updateWorkspaceCommit,
  updateWorkspaceFields,
  updateWorkspacePredicateWorkspaces,
  updateWorkspacePrepareWorkspaces,
  updateWorkspaceReadWorkspaces,
} from '../persistence/commands.ts';
export async function readWorkspace(r: RequestRepository, id: EntityId) {
  const [row] = await readWorkspaceReadWorkspaces(r, id);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Workspace not found');
  return workspaceDto({ ...row, brand: !!row.brand });
}
export async function updateWorkspace(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  body: UpdateWorkspaceInput,
  now: number,
  generateId: IdGenerator = newId,
) {
  administrator(actor);
  const { expectedVersion, ...patch } = body,
    fields = updateWorkspaceFields(patch, now, generateId);
  if (patch.slug && (await updateWorkspaceReadWorkspaces(r, patch, s)).length)
    throw new ApiFailure('CONFLICT', 'Workspace slug exists');
  const guard = patch.slug ? updateWorkspacePredicateWorkspaces() : '';
  const statement = updateWorkspacePrepareWorkspaces(r, fields, guard, s, expectedVersion, patch);
  updateWorkspaceBudget(r);
  await updateWorkspaceCommit(r, statement);
  return readWorkspace(r, s.workspaceId);
}
