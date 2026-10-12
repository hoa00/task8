import type { $brand } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch, markerSql } from '../../../db/commands.ts';
import { epoch } from '../../../shared/clock.ts';
import { actorParameters, actorSql, writeAccessSql } from '../access.ts';

export function undoProjectPredicateCommandUndoRecords() {
  return `EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)`;
}
export function undoProjectMarkerProjects() {
  return markerSql('projects');
}
export function undoProjectPrepareProjects(
  r: RequestRepository,
  pending: string,
  before: {
    archivedAt: (string & $brand<'Instant'>) | null;
    deletedAt: (string & $brand<'Instant'>) | null;
    deletedBy: (string & $brand<'EntityId'>) | null;
    updatedAt: string & $brand<'Instant'>;
  },
  now: number,
  marker: string & $brand<'EntityId'>,
  s: WorkspaceContext,
  t: {
    before: {
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      deletedBy: (string & $brand<'EntityId'>) | null;
      updatedAt: string & $brand<'Instant'>;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
  },
  payload: {
    kind: 'task.archive' | 'task.delete' | 'project.archive' | 'project.delete';
    targets: {
      before: {
        archivedAt: (string & $brand<'Instant'>) | null;
        deletedAt: (string & $brand<'Instant'>) | null;
        deletedBy: (string & $brand<'EntityId'>) | null;
        updatedAt: string & $brand<'Instant'>;
      };
      id: string & $brand<'EntityId'>;
      postVersion: number;
    }[];
    activityIds: (string & $brand<'EntityId'>)[];
  },
  record: {
    kind: string;
    id: string;
    createdAt: number;
    workspaceId: string;
    actorMemberId: string;
    payloadVersion: number;
    payloadJson: string;
    consumedAt: number | null;
    resultJson: string | null;
  },
  pendingParams: string[],
) {
  return r.prepare(
    `UPDATE projects AS p SET archivedAt=?,deletedAt=?,deletedBy=?,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND version=? AND archivedAt IS ? AND deletedAt IS ? AND deletedBy IS ? AND ${writeAccessSql} AND ${actorSql()} AND ${pending}`,
    [
      epoch(before.archivedAt),
      epoch(before.deletedAt),
      before.deletedBy,
      now,
      marker,
      s.workspaceId,
      t.id,
      t.postVersion,
      payload.kind === 'project.archive' ? record.createdAt : epoch(before.archivedAt),
      payload.kind === 'project.delete' ? record.createdAt : epoch(before.deletedAt),
      payload.kind === 'project.delete' ? s.memberId : before.deletedBy,
      s.memberId,
      ...actorParameters(s),
      ...pendingParams,
    ],
  );
}
export function undoProjectPrepareActivity(
  r: RequestRepository,
  gate: { sql: string; parameters: (string | number | null)[] },
  now: number,
  s: WorkspaceContext,
  payload: {
    kind: 'task.archive' | 'task.delete' | 'project.archive' | 'project.delete';
    targets: {
      before: {
        archivedAt: (string & $brand<'Instant'>) | null;
        deletedAt: (string & $brand<'Instant'>) | null;
        deletedBy: (string & $brand<'EntityId'>) | null;
        updatedAt: string & $brand<'Instant'>;
      };
      id: string & $brand<'EntityId'>;
      postVersion: number;
    }[];
    activityIds: (string & $brand<'EntityId'>)[];
  },
) {
  return r.prepare(
    `UPDATE activity SET revertedAt=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND commandId IS NOT NULL AND ${gate.sql}`,
    [now, s.workspaceId, JSON.stringify(payload.activityIds), ...gate.parameters],
  );
}
export function undoProjectPrepareCommandUndoRecords(
  r: RequestRepository,
  gate: { sql: string; parameters: (string | number | null)[] },
  now: number,
  result: string,
  s: WorkspaceContext,
  id: string,
) {
  return r.prepare(
    `UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL AND ${gate.sql}`,
    [now, result, s.workspaceId, id, s.memberId, ...gate.parameters],
  );
}
export function undoProjectBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 1);
}
export function undoProjectCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return r.batch(statements);
}
export function undoProjectReadCommandUndoRecords(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string,
) {
  return r.all<{ resultJson: string | null }>(
    'SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
    [s.workspaceId, id, s.memberId],
  );
}
