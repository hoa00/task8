export type TeamCommand =
  | { kind: 'create'; input: CreateTeamInput }
  | { kind: 'update'; id: EntityId; input: UpdateTeamInput };
import type { CreateTeamInput, EntityId, MemberDto, UpdateTeamInput } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { encodeUndoPayload } from '../../../db/undo.ts';
import { nullableInstant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { members } from '../../members/projections.ts';
import { actorParameters, administrator } from '../../projects/access.ts';
import { normalized } from '../domain/normalization.ts';
import {
  deleteTeamBudget,
  deleteTeamCommit,
  deleteTeamGuardProjects,
  deleteTeamGuardWorkspaceMembers,
  deleteTeamInsertCommandUndoRecords,
  deleteTeamMarkerTeams,
  deleteTeamPrepareJson,
  deleteTeamPrepareTeams,
  deleteTeamReadProjects,
  deleteTeamReadWorkspaceMembers,
  mutateTeamBudget,
  mutateTeamCommit,
  mutateTeamFields,
  mutateTeamGuardJson,
  mutateTeamGuardJsonResult,
  mutateTeamInsertTeams,
  mutateTeamMarkerTeams,
  mutateTeamPredicateTeams,
  mutateTeamPrepareTeams,
  mutateTeamPrepareTeamsResult,
  mutateTeamPrepareWorkspaceMembers,
  mutateTeamReadTeams,
  mutateTeamReadTeamsResult,
  mutateTeamReadWorkspaceMembers,
} from '../persistence/commands.ts';
import type { TeamRow } from '../projections.ts';
import { teamDto, teamRow } from '../projections.ts';

export async function mutateTeam(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  command: TeamCommand,
  now: number,
  generateId: IdGenerator = newId,
) {
  const body = command.input,
    id = command.kind === 'update' ? command.id : undefined;
  administrator(actor);
  const old = id ? await teamRow(r, s, id) : null;
  if (old && (!('expectedVersion' in body) || old.version !== body.expectedVersion))
    throw new ApiFailure('CONFLICT', 'Team version changed');
  const memberRows = await mutateTeamReadWorkspaceMembers(r, s);
  const selected =
    body.memberIds ??
    memberRows
      .filter((m) => m.teamId === id && m.removedAt === null)
      .map((m) => EntityIdSchema.parse(m.id));
  if (selected.some((mid) => !memberRows.some((m) => m.id === mid && m.removedAt === null)))
    throw new ApiFailure('VALIDATION_ERROR', 'Choose workspace members');
  const rootId = id ?? generateId(),
    marker = generateId(),
    name = body.name ?? required(old, 'Missing teams state').name;
  if ((await mutateTeamReadTeams(r, s, name, rootId)).length)
    throw new ApiFailure('CONFLICT', 'Team name already exists');
  const changed = memberRows.filter((m) =>
    selected.includes(EntityIdSchema.parse(m.id)) ? m.teamId !== rootId : m.teamId === rootId,
  );
  const otherIds = [
    ...new Set(changed.flatMap((m) => (m.teamId && m.teamId !== rootId ? [m.teamId] : []))),
  ];
  const otherTeams = await mutateTeamReadTeamsResult(r, s, otherIds);
  const scopeGuard = mutateTeamGuardJson(s, rootId, selected, memberRows);
  const teamGuard = mutateTeamGuardJsonResult(s, otherIds, otherTeams);
  const guard = {
    sql: mutateTeamPredicateTeams(scopeGuard, teamGuard),
    parameters: [
      ...actorParameters(s),
      ...scopeGuard.parameters,
      ...teamGuard.parameters,
      s.workspaceId,
      normalized(name),
      rootId,
    ],
  };
  const row: TeamRow = {
    id: rootId,
    workspaceId: s.workspaceId,
    name,
    nameNormalized: normalized(name),
    description: body.description ?? old?.description ?? 'No description yet.',
    icon: body.icon ?? required(old, 'Missing teams state').icon,
    color: body.color ?? required(old, 'Missing teams state').color,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
    version: (old?.version ?? 0) + 1,
    lastMutationId: marker,
  };
  if (!old) row.description = row.description.trim() || 'No description yet.';
  const gate = { sql: mutateTeamMarkerTeams(), parameters: [rootId, marker] };
  const fields = mutateTeamFields(row, now, marker);
  const statements = [
    old
      ? mutateTeamPrepareTeams(r, fields, guard, s, rootId, old)
      : mutateTeamInsertTeams(r, row, guard),
  ];
  if (changed.length)
    statements.push(
      mutateTeamPrepareWorkspaceMembers(r, gate, selected, rootId, now, marker, s, changed),
    );
  if (otherIds.length)
    statements.push(mutateTeamPrepareTeamsResult(r, gate, now, marker, s, otherIds));
  mutateTeamBudget(r, statements);
  await mutateTeamCommit(r, statements);
  const ms = await members(r, s);
  return {
    team: teamDto(row, ms),
    members: ms.filter((m) => changed.some((c) => c.id === m.id)),
    affectedProjectIds: [],
    undo: null,
  };
}
export async function deleteTeam(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  id: EntityId,
  expectedVersion: number,
  now: number,
  generateId: IdGenerator = newId,
) {
  administrator(actor);
  const team = await teamRow(r, s, id);
  if (team.version !== expectedVersion) throw new ApiFailure('CONFLICT', 'Team version changed');
  const ms = await deleteTeamReadWorkspaceMembers(r, s, id);
  const ps = await deleteTeamReadProjects(r, s, id);
  if (1 + ms.length + ps.length > 128)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Team exceeds bounded Undo targets');
  const marker = generateId(),
    undoId = generateId();
  const base = {
    teamId: null,
    nameNormalized: null,
    archivedAt: null,
    deletedAt: null,
    removedAt: null,
  };
  const payload = encodeUndoPayload({
    kind: 'team.delete',
    activityIds: [],
    targets: [
      {
        id,
        entity: 'team',
        postVersion: team.version + 1,
        before: { ...base, nameNormalized: team.nameNormalized },
      },
      ...ms.map((m) => ({
        id: m.id,
        entity: 'member',
        postVersion: m.version + 1,
        before: { ...base, teamId: id, status: m.status, removedAt: nullableInstant(m.removedAt) },
      })),
      ...ps.map((p) => ({
        id: p.id,
        entity: 'project',
        postVersion: p.version + 1,
        before: {
          ...base,
          teamId: id,
          archivedAt: nullableInstant(p.archivedAt),
          deletedAt: nullableInstant(p.deletedAt),
          deletedBy: p.deletedBy,
        },
      })),
    ],
  });
  const mg = deleteTeamGuardWorkspaceMembers(s, id, ms);
  const pg = deleteTeamGuardProjects(s, id, ps);
  const gate = { sql: deleteTeamMarkerTeams(), parameters: [id, marker] };
  const statements = [deleteTeamPrepareTeams(r, mg, pg, now, s, marker, id, expectedVersion)];
  for (const [table, rows] of [
    ['workspaceMembers', ms],
    ['projects', ps],
  ] as const)
    if (rows.length) statements.push(deleteTeamPrepareJson(r, table, gate, now, marker, s, rows));
  statements.push(deleteTeamInsertCommandUndoRecords(r, undoId, s, payload, now, gate));
  deleteTeamBudget(r, statements);
  await deleteTeamCommit(r, statements);
  const resultMembers = (await members(r, s)).filter((m) => ms.some((old) => old.id === m.id));
  return {
    team: teamDto(
      { ...team, deletedAt: now, deletedBy: s.memberId, updatedAt: now, version: team.version + 1 },
      [],
    ),
    members: resultMembers,
    affectedProjectIds: ps.map((p) => p.id),
    undo: { id: undoId, kind: 'team.delete' as const },
  };
}
