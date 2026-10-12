import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { actorParameters, actorSql, writeAccessSql } from '../../projects/index.ts';
import type { FileParent } from './model.ts';
export function rootGate(
  r: RequestRepository,
  s: WorkspaceContext,
  p: FileParent,
  projectId: string,
  marker: string,
  now: number,
  guards: SqlPredicate[],
  cas: number | null,
) {
  const scope =
    p.table === 'projects'
      ? `id=? AND archivedAt IS NULL AND deletedAt IS NULL AND ${writeAccessSql.replaceAll('p.', 'projects.')}`
      : `id=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql})`;
  const root = r.prepare(
    `UPDATE ${p.table} SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND ${scope} ${cas === null ? '' : 'AND version=?'} AND ${actorSql()} ${guards.map((g) => `AND (${g.sql})`).join(' ')}`,
    [
      now,
      marker,
      s.workspaceId,
      p.id,
      ...(p.table === 'tasks' ? [projectId] : []),
      s.memberId,
      ...(cas === null ? [] : [cas]),
      ...actorParameters(s),
      ...guards.flatMap((g) => g.parameters),
    ],
  );
  return {
    root,
    gate: {
      sql: `EXISTS (SELECT 1 FROM ${p.table} gate WHERE gate.workspaceId=? AND gate.id=? AND gate.lastMutationId=?)`,
      parameters: [s.workspaceId, p.id, marker],
    },
  };
}
