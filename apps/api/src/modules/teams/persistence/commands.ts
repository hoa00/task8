import type { EntityId } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, SqlValue, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import {
  exactSet,
  fitBatch,
  gatedInsert,
  markerSql,
  matchedBatch,
  patchSql,
} from '../../../db/commands.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';
import type { ProjectRow } from '../../projects/projections.ts';
import { normalized } from '../domain/normalization.ts';
import type { TeamRow } from '../projections.ts';
import type { MemberRow } from './commands-model.ts';
export function mutateTeamReadWorkspaceMembers(r: RequestRepository, s: WorkspaceContext) {
  return r.all<MemberRow>('SELECT * FROM workspaceMembers WHERE workspaceId=?', [s.workspaceId]);
}
export function mutateTeamReadTeams(
  r: RequestRepository,
  s: WorkspaceContext,
  name: string,
  rootId: EntityId,
) {
  return r.all(
    'SELECT id FROM teams WHERE workspaceId=? AND nameNormalized=? AND deletedAt IS NULL AND id!=?',
    [s.workspaceId, normalized(name), rootId],
  );
}
export function mutateTeamReadTeamsResult(
  r: RequestRepository,
  s: WorkspaceContext,
  otherIds: string[],
) {
  return r.all<TeamRow>(
    'SELECT * FROM teams WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(otherIds)],
  );
}
export function mutateTeamGuardJson(
  s: WorkspaceContext,
  rootId: EntityId,
  selected: EntityId[],
  memberRows: {
    version: number;
    id: string;
    workspaceId: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    status: string;
    teamId: string | null;
    userId: string;
    role: string;
    lastSeenAt: number | null;
    removedAt: number | null;
  }[],
) {
  return exactSet(
    'workspaceMembers',
    'workspaceId=? AND (teamId=? OR id IN (SELECT value FROM json_each(?)))',
    [s.workspaceId, rootId, JSON.stringify(selected)],
    memberRows.filter((m) => m.teamId === rootId || selected.includes(EntityIdSchema.parse(m.id))),
    ['id', 'version', 'teamId', 'removedAt', 'status'],
  );
}
export function mutateTeamGuardJsonResult(
  s: WorkspaceContext,
  otherIds: string[],
  otherTeams: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    description: string;
    icon: string;
    color: string;
    deletedAt: number | null;
    deletedBy: string | null;
    nameNormalized: string;
  }[],
) {
  return exactSet(
    'teams',
    'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(otherIds)],
    otherTeams,
    ['id', 'version', 'deletedAt'],
  );
}
export function mutateTeamPredicateTeams(scopeGuard: SqlPredicate, teamGuard: SqlPredicate) {
  return `${actorSql('administrator')} AND ${scopeGuard.sql} AND ${teamGuard.sql} AND NOT EXISTS (SELECT 1 FROM teams WHERE workspaceId=? AND nameNormalized=? AND deletedAt IS NULL AND id!=?)`;
}
export function mutateTeamMarkerTeams() {
  return markerSql('teams');
}
export function mutateTeamFields(
  row: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    description: string;
    icon: string;
    color: string;
    deletedAt: number | null;
    deletedBy: string | null;
    nameNormalized: string;
  },
  now: number,
  marker: EntityId,
) {
  return patchSql({
    name: row.name,
    nameNormalized: row.nameNormalized,
    description: row.description,
    icon: row.icon,
    color: row.color,
    updatedAt: now,
    lastMutationId: marker,
  });
}
export function mutateTeamPrepareTeams(
  r: RequestRepository,
  fields: { sql: string; parameters: (string | number | null)[] },
  guard: { sql: string; parameters: SqlValue[] },
  s: WorkspaceContext,
  rootId: EntityId,
  old: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    description: string;
    icon: string;
    color: string;
    deletedAt: number | null;
    deletedBy: string | null;
    nameNormalized: string;
  },
) {
  return r.prepare(
    `UPDATE teams SET ${fields.sql},version=version+1 WHERE workspaceId=? AND id=? AND version=? AND deletedAt IS NULL AND ${guard.sql}`,
    [...fields.parameters, s.workspaceId, rootId, old.version, ...guard.parameters],
  );
}
export function mutateTeamInsertTeams(
  r: RequestRepository,
  row: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    description: string;
    icon: string;
    color: string;
    deletedAt: number | null;
    deletedBy: string | null;
    nameNormalized: string;
  },
  guard: { sql: string; parameters: SqlValue[] },
) {
  return gatedInsert(r, 'teams', [row], guard);
}
export function mutateTeamPrepareWorkspaceMembers(
  r: RequestRepository,
  gate: { sql: string; parameters: EntityId[] },
  selected: EntityId[],
  rootId: EntityId,
  now: number,
  marker: EntityId,
  s: WorkspaceContext,
  changed: {
    version: number;
    id: string;
    workspaceId: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    status: string;
    teamId: string | null;
    userId: string;
    role: string;
    lastSeenAt: number | null;
    removedAt: number | null;
  }[],
) {
  return r.prepare(
    `UPDATE workspaceMembers SET teamId=CASE WHEN id IN (SELECT value FROM json_each(?)) THEN ? ELSE NULL END,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
    [
      JSON.stringify(selected),
      rootId,
      now,
      marker,
      s.workspaceId,
      JSON.stringify(changed.map((m) => m.id)),
      ...gate.parameters,
    ],
  );
}
export function mutateTeamPrepareTeamsResult(
  r: RequestRepository,
  gate: { sql: string; parameters: EntityId[] },
  now: number,
  marker: EntityId,
  s: WorkspaceContext,
  otherIds: string[],
) {
  return r.prepare(
    `UPDATE teams SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
    [now, marker, s.workspaceId, JSON.stringify(otherIds), ...gate.parameters],
  );
}
export function mutateTeamBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 2);
}
export function mutateTeamCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch(r, statements);
}
export function deleteTeamReadWorkspaceMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.all<MemberRow>(
    'SELECT * FROM workspaceMembers WHERE workspaceId=? AND teamId=? ORDER BY id',
    [s.workspaceId, id],
  );
}
export function deleteTeamReadProjects(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  return r.all<ProjectRow>('SELECT * FROM projects WHERE workspaceId=? AND teamId=? ORDER BY id', [
    s.workspaceId,
    id,
  ]);
}
export function deleteTeamGuardWorkspaceMembers(
  s: WorkspaceContext,
  id: EntityId,
  ms: {
    version: number;
    id: string;
    workspaceId: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    status: string;
    teamId: string | null;
    userId: string;
    role: string;
    lastSeenAt: number | null;
    removedAt: number | null;
  }[],
) {
  return exactSet('workspaceMembers', 'workspaceId=? AND teamId=?', [s.workspaceId, id], ms, [
    'id',
    'version',
    'teamId',
    'removedAt',
    'status',
  ]);
}
export function deleteTeamGuardProjects(
  s: WorkspaceContext,
  id: EntityId,
  ps: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  }[],
) {
  return exactSet('projects', 'workspaceId=? AND teamId=?', [s.workspaceId, id], ps, [
    'id',
    'version',
    'teamId',
    'archivedAt',
    'deletedAt',
    'deletedBy',
  ]);
}
export function deleteTeamMarkerTeams() {
  return markerSql('teams');
}
export function deleteTeamPrepareTeams(
  r: RequestRepository,
  mg: SqlPredicate,
  pg: SqlPredicate,
  now: number,
  s: WorkspaceContext,
  marker: EntityId,
  id: EntityId,
  expectedVersion: number,
) {
  return r.prepare(
    `UPDATE teams SET deletedAt=?,deletedBy=?,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND version=? AND deletedAt IS NULL AND ${actorSql('administrator')} AND ${mg.sql} AND ${pg.sql}`,
    [
      now,
      s.memberId,
      now,
      marker,
      s.workspaceId,
      id,
      expectedVersion,
      ...actorParameters(s),
      ...mg.parameters,
      ...pg.parameters,
    ],
  );
}
export function deleteTeamPrepareJson(
  r: RequestRepository,
  table: 'projects' | 'workspaceMembers',
  gate: { sql: string; parameters: EntityId[] },
  now: number,
  marker: EntityId,
  s: WorkspaceContext,
  rows:
    | {
        version: number;
        id: string;
        workspaceId: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        lastMutationId: string | null;
        key: string;
        taskSequence: number;
        description: string;
        icon: string;
        color: string;
        status: string;
        teamId: string | null;
        leadId: string;
        startDate: string | null;
        dueDate: string | null;
        visibility: string;
        lastActivityAt: number;
        archivedAt: number | null;
        deletedAt: number | null;
        deletedBy: string | null;
      }[]
    | {
        version: number;
        id: string;
        workspaceId: string;
        createdAt: number;
        updatedAt: number;
        lastMutationId: string | null;
        status: string;
        teamId: string | null;
        userId: string;
        role: string;
        lastSeenAt: number | null;
        removedAt: number | null;
      }[],
) {
  return r.prepare(
    `UPDATE ${table} SET teamId=NULL,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
    [now, marker, s.workspaceId, JSON.stringify(rows.map((row) => row.id)), ...gate.parameters],
  );
}
export function deleteTeamInsertCommandUndoRecords(
  r: RequestRepository,
  undoId: EntityId,
  s: WorkspaceContext,
  payload: string,
  now: number,
  gate: { sql: string; parameters: EntityId[] },
) {
  return gatedInsert(
    r,
    'commandUndoRecords',
    [
      {
        id: undoId,
        workspaceId: s.workspaceId,
        actorMemberId: s.memberId,
        kind: 'team.delete',
        payloadVersion: 1,
        payloadJson: payload,
        createdAt: now,
        consumedAt: null,
        resultJson: null,
      },
    ],
    gate,
  );
}
export function deleteTeamBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 1);
}
export function deleteTeamCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch(r, statements);
}
