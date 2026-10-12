import type { $brand } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { exactSet, fitBatch, markerSql } from '../../../db/commands.ts';
import { epoch } from '../../../shared/clock.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';

export function undoTeamPredicateCommandUndoRecords() {
  return `EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)`;
}
export function undoTeamGuardJson(
  s: WorkspaceContext,
  ms: {
    entity: 'project' | 'team' | 'member';
    before: {
      teamId: (string & $brand<'EntityId'>) | null;
      nameNormalized: string | null;
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      removedAt: (string & $brand<'Instant'>) | null;
      status?: 'active' | 'invited' | undefined;
      deletedBy?: (string & $brand<'EntityId'>) | null | undefined;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
  }[],
) {
  return exactSet(
    'workspaceMembers',
    'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(ms.map((t) => t.id))],
    ms.map((t) => ({
      id: t.id,
      version: t.postVersion,
      teamId: null,
      removedAt: epoch(t.before.removedAt),
      status: t.before.status,
    })),
    ['id', 'version', 'teamId', 'removedAt', 'status'],
  );
}
export function undoTeamGuardJsonResult(
  s: WorkspaceContext,
  ps: {
    entity: 'project' | 'team' | 'member';
    before: {
      teamId: (string & $brand<'EntityId'>) | null;
      nameNormalized: string | null;
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      removedAt: (string & $brand<'Instant'>) | null;
      status?: 'active' | 'invited' | undefined;
      deletedBy?: (string & $brand<'EntityId'>) | null | undefined;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
  }[],
) {
  return exactSet(
    'projects',
    'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(ps.map((t) => t.id))],
    ps.map((t) => ({
      id: t.id,
      version: t.postVersion,
      teamId: null,
      archivedAt: epoch(t.before.archivedAt),
      deletedAt: epoch(t.before.deletedAt),
      deletedBy: t.before.deletedBy ?? null,
    })),
    ['id', 'version', 'teamId', 'archivedAt', 'deletedAt', 'deletedBy'],
  );
}
export function undoTeamMarkerTeams() {
  return markerSql('teams');
}
export function undoTeamPrepareTeams(
  r: RequestRepository,
  pending: string,
  mg: SqlPredicate,
  pg: SqlPredicate,
  now: number,
  marker: string & $brand<'EntityId'>,
  s: WorkspaceContext,
  team: {
    entity: 'project' | 'team' | 'member';
    before: {
      teamId: (string & $brand<'EntityId'>) | null;
      nameNormalized: string | null;
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      removedAt: (string & $brand<'Instant'>) | null;
      status?: 'active' | 'invited' | undefined;
      deletedBy?: (string & $brand<'EntityId'>) | null | undefined;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
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
    `UPDATE teams SET deletedAt=NULL,deletedBy=NULL,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND version=? AND deletedAt=? AND deletedBy=? AND nameNormalized=? AND ${pending} AND ${actorSql('administrator')} AND ${mg.sql} AND ${pg.sql} AND NOT EXISTS (SELECT 1 FROM teams reuse WHERE reuse.workspaceId=? AND reuse.id!=? AND reuse.nameNormalized=? AND reuse.deletedAt IS NULL)`,
    [
      now,
      marker,
      s.workspaceId,
      team.id,
      team.postVersion,
      record.createdAt,
      s.memberId,
      team.before.nameNormalized,
      ...pendingParams,
      ...actorParameters(s),
      ...mg.parameters,
      ...pg.parameters,
      s.workspaceId,
      team.id,
      team.before.nameNormalized,
    ],
  );
}
export function undoTeamPrepareJson(
  r: RequestRepository,
  table: 'workspaceMembers' | 'projects',
  gate: { sql: string; parameters: (string | number | null)[] },
  team: {
    entity: 'project' | 'team' | 'member';
    before: {
      teamId: (string & $brand<'EntityId'>) | null;
      nameNormalized: string | null;
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      removedAt: (string & $brand<'Instant'>) | null;
      status?: 'active' | 'invited' | undefined;
      deletedBy?: (string & $brand<'EntityId'>) | null | undefined;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
  },
  now: number,
  marker: string & $brand<'EntityId'>,
  s: WorkspaceContext,
  rows: {
    entity: 'project' | 'team' | 'member';
    before: {
      teamId: (string & $brand<'EntityId'>) | null;
      nameNormalized: string | null;
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      removedAt: (string & $brand<'Instant'>) | null;
      status?: 'active' | 'invited' | undefined;
      deletedBy?: (string & $brand<'EntityId'>) | null | undefined;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
  }[],
) {
  return r.prepare(
    `UPDATE ${table} SET teamId=?,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
    [
      team.id,
      now,
      marker,
      s.workspaceId,
      JSON.stringify(rows.map((t) => t.id)),
      ...gate.parameters,
    ],
  );
}
export function undoTeamPrepareActivity(
  r: RequestRepository,
  gate: { sql: string; parameters: (string | number | null)[] },
  now: number,
  s: WorkspaceContext,
  payload: {
    kind: 'team.delete';
    targets: {
      entity: 'project' | 'team' | 'member';
      before: {
        teamId: (string & $brand<'EntityId'>) | null;
        nameNormalized: string | null;
        archivedAt: (string & $brand<'Instant'>) | null;
        deletedAt: (string & $brand<'Instant'>) | null;
        removedAt: (string & $brand<'Instant'>) | null;
        status?: 'active' | 'invited' | undefined;
        deletedBy?: (string & $brand<'EntityId'>) | null | undefined;
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
export function undoTeamPrepareCommandUndoRecords(
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
export function undoTeamBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 1);
}
export function undoTeamCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return r.batch(statements);
}
export function undoTeamReadCommandUndoRecords(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string,
) {
  return r.all<{ resultJson: string | null }>(
    'SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
    [s.workspaceId, id, s.memberId],
  );
}
