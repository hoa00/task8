import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { TeamRow } from './model.ts';
export async function teamRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  deleted = false,
) {
  const [row] = await r.all<TeamRow>(
    `SELECT * FROM teams WHERE workspaceId=? AND id=?${deleted ? '' : ' AND deletedAt IS NULL'}`,
    [s.workspaceId, id],
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Team not found');
  return row;
}
