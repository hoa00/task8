import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { readAccessSql as accessSql, actorParameters, actorSql } from '../../projects/index.ts';
import type { FileRow } from './model.ts';
export async function fileRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  deleted = false,
) {
  const [f] = await r.all<FileRow>(
    `SELECT f.* FROM files f JOIN projects p ON p.workspaceId=f.workspaceId AND p.id=f.projectId WHERE f.workspaceId=? AND f.id=? ${deleted ? '' : 'AND f.deletedAt IS NULL'} AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql} AND (f.taskId IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.workspaceId=f.workspaceId AND t.id=f.taskId AND t.projectId=f.projectId AND t.deletedAt IS NULL AND t.archivedAt IS NULL))`,
    [s.workspaceId, id, s.memberId],
  );
  if (!f) throw new ApiFailure('NOT_FOUND', 'File not found');
  return f;
}
export async function intent(r: RequestRepository, s: WorkspaceContext, key: string) {
  return (
    await r.all<FileRow & { actorValid: number }>(
      `SELECT f.*,${actorSql()} actorValid FROM files f WHERE workspaceId=? AND createdBy=? AND uploadRequestId=?`,
      [...actorParameters(s), s.workspaceId, s.memberId, key],
    )
  )[0];
}
export async function currentActor(r: RequestRepository, s: WorkspaceContext) {
  const [valid] = await r.all<{ valid: number }>(`SELECT ${actorSql()} valid`, actorParameters(s));
  if (!valid?.valid) throw new ApiFailure('CONFLICT', 'Upload actor authorization changed');
}
