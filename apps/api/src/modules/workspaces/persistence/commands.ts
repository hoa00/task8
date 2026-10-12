import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch, matchedBatch, patchSql } from '../../../db/commands.ts';
import type { workspaces } from '../../../db/schema.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';

export function readWorkspaceReadWorkspaces(r: RequestRepository, id: EntityId) {
  return r.all<typeof workspaces.$inferSelect>('SELECT * FROM workspaces WHERE id=?', [id]);
}
export function updateWorkspaceFields(
  patch: { name?: string | undefined; slug?: string | undefined; iconColor?: string | undefined },
  now: number,
  generateId: IdGenerator = newId,
) {
  return patchSql({ ...patch, updatedAt: now, lastMutationId: generateId() });
}
export function updateWorkspaceReadWorkspaces(
  r: RequestRepository,
  patch: { name?: string | undefined; slug?: string | undefined; iconColor?: string | undefined },
  s: WorkspaceContext,
) {
  if (patch.slug === undefined) throw new ApiFailure('INTERNAL_ERROR', 'Missing slug preflight');
  return r.all('SELECT id FROM workspaces WHERE slug=? AND id!=?', [patch.slug, s.workspaceId]);
}
export function updateWorkspacePredicateWorkspaces() {
  return 'AND NOT EXISTS (SELECT 1 FROM workspaces other WHERE other.slug=? AND other.id!=?)';
}
export function updateWorkspacePrepareWorkspaces(
  r: RequestRepository,
  fields: { sql: string; parameters: (string | number | null)[] },
  guard: string,
  s: WorkspaceContext,
  expectedVersion: number,
  patch: { name?: string | undefined; slug?: string | undefined; iconColor?: string | undefined },
) {
  return r.prepare(
    `UPDATE workspaces SET ${fields.sql},version=version+1 WHERE id=? AND version=? AND ${actorSql('administrator')} ${guard}`,
    [
      ...fields.parameters,
      s.workspaceId,
      expectedVersion,
      ...actorParameters(s),
      ...(patch.slug ? [patch.slug, s.workspaceId] : []),
    ],
  );
}
export function updateWorkspaceBudget(r: RequestRepository) {
  return fitBatch(r, 1, 1);
}
export function updateWorkspaceCommit(r: RequestRepository, statement: D1PreparedStatement) {
  return matchedBatch(r, [statement]);
}
