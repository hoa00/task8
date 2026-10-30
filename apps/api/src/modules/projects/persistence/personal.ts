import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, SqlValue, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { exactSet, gatedInsert, markerSql, matchedBatch } from '../../../db/commands.ts';
import { readAccessSql as accessSql, actorParameters, actorSql } from '../access.ts';

export function favoriteProjectPredicateProjects() {
  return `EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.deletedAt IS NULL AND ${accessSql}) AND ${actorSql()}`;
}
export function favoriteProjectPrepare(
  r: RequestRepository,
  permitted: string,
  s: WorkspaceContext,
  id: EntityId,
  now: number,
  parameters: SqlValue[],
) {
  return r.prepare(
    `INSERT OR IGNORE INTO projectFavorites(workspaceId,memberId,projectId,createdAt) SELECT ?,?,?,? WHERE ${permitted}`,
    [s.workspaceId, s.memberId, id, now, ...parameters],
  );
}
export function favoriteProjectPrepareProjectFavorites(
  r: RequestRepository,
  permitted: string,
  s: WorkspaceContext,
  id: EntityId,
  parameters: SqlValue[],
) {
  return r.prepare(
    `DELETE FROM projectFavorites WHERE workspaceId=? AND memberId=? AND projectId=? AND ${permitted}`,
    [s.workspaceId, s.memberId, id, ...parameters],
  );
}
export function favoriteProjectCommitProjectFavorites(
  r: RequestRepository,
  mutation: D1PreparedStatement,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.batch<{ id: string; favorite: number; authorized: number }>([
    mutation,
    r.prepare(
      `SELECT p.id,${actorSql()} authorized,EXISTS (SELECT 1 FROM projectFavorites f WHERE f.workspaceId=p.workspaceId AND f.projectId=p.id AND f.memberId=?) favorite FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.deletedAt IS NULL AND ${accessSql}`,
      [...actorParameters(s), s.memberId, s.workspaceId, id, s.memberId],
    ),
  ]);
}
export function projectOrderReadProjects(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ id: string }>(
    'SELECT id FROM projects WHERE workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL ORDER BY id',
    [s.workspaceId],
  );
}
export function projectOrderReadMemberProjectOrder(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ projectId: string; position: number }>(
    'SELECT projectId,position FROM memberProjectOrder WHERE workspaceId=? AND memberId=? ORDER BY position,projectId',
    [s.workspaceId, s.memberId],
  );
}
export function projectOrderGuardMemberProjectOrder(
  s: WorkspaceContext,
  old: { projectId: string; position: number }[],
) {
  return exactSet(
    'memberProjectOrder',
    'workspaceId=? AND memberId=?',
    [s.workspaceId, s.memberId],
    old,
    ['projectId', 'position'],
  );
}
export function projectOrderGuardProjects(s: WorkspaceContext, catalog: { id: string }[]) {
  return exactSet(
    'projects',
    'workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL',
    [s.workspaceId],
    catalog,
    ['id'],
  );
}
export function projectOrderMarkerWorkspaces() {
  return markerSql('workspaces');
}
export function projectOrderPrepareWorkspaces(
  r: RequestRepository,
  orders: SqlPredicate,
  projects: SqlPredicate,
  marker: EntityId,
  s: WorkspaceContext,
) {
  return r.prepare(
    `UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND ${orders.sql} AND ${projects.sql}`,
    [marker, s.workspaceId, ...actorParameters(s), ...orders.parameters, ...projects.parameters],
  );
}
export function projectOrderPrepareMemberProjectOrder(
  r: RequestRepository,
  gate: { sql: string; parameters: SqlValue[] },
  s: WorkspaceContext,
) {
  return r.prepare(
    `DELETE FROM memberProjectOrder WHERE workspaceId=? AND memberId=? AND ${gate.sql}`,
    [s.workspaceId, s.memberId, ...gate.parameters],
  );
}
export function projectOrderInsertMemberProjectOrder(
  r: RequestRepository,
  rows: { workspaceId: EntityId; memberId: EntityId; projectId: string; position: number }[],
  gate: { sql: string; parameters: SqlValue[] },
) {
  return gatedInsert(r, 'memberProjectOrder', rows, gate);
}
export function projectOrderCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch(r, statements);
}
