import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { projectMembers, projects } from './schema.ts';
import { ApiFailure } from '../errors.ts';
import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from './repository.ts';

// Reuse this predicate for children and aggregates. Role never bypasses a private grant.
export function projectAccess(scope: WorkspaceContext, active = true) {
  return and(
    eq(projects.workspaceId, scope.workspaceId),
    isNull(projects.deletedAt),
    ...(active ? [isNull(projects.archivedAt)] : []),
    or(
      eq(projects.visibility, 'workspace'),
      sql`EXISTS (SELECT 1 FROM ${projectMembers} WHERE ${projectMembers.workspaceId} = ${projects.workspaceId} AND ${projectMembers.projectId} = ${projects.id} AND ${projectMembers.memberId} = ${scope.memberId})`,
    ),
  );
}
export const accessSql = `(p.visibility = 'workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?))`;

// Foundation only: SQL zero-row CAS must gate EVERY side effect by the fresh marker.
// Business command builders and dispatchers are intentionally owned by later units.
export function taskVersionGate(
  repository: RequestRepository,
  scope: WorkspaceContext,
  taskId: EntityId,
  expectedVersion: number,
  commandId: EntityId,
  now: number,
) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid expectedVersion');
  return repository.prepare(
    `UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND version=? AND archivedAt IS NULL AND deletedAt IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql})`,
    [now, commandId, scope.workspaceId, taskId, expectedVersion, scope.memberId],
  );
}
export function taskMarkerSql() {
  return 'EXISTS (SELECT 1 FROM tasks gate WHERE gate.workspaceId=? AND gate.id=? AND gate.lastMutationId=?)';
}
export function taskMarkerParameters(
  scope: WorkspaceContext,
  taskId: EntityId,
  commandId: EntityId,
) {
  return [scope.workspaceId, taskId, commandId];
}
export function requireMatchedVersion(results: D1Result[]) {
  if (results[0]?.meta.changes !== 1) throw new ApiFailure('CONFLICT', 'Version or scope changed');
}
