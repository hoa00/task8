import type { CreateTeamInput, EntityId, MemberDto, UpdateTeamInput } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/client.ts';
import {
  exactSet,
  fitBatch,
  gatedInsert,
  markerSql,
  matchedBatch,
  patchSql,
} from '../db/commands.ts';
import type { workspaceMembers } from '../db/schema.ts';
import { encodeUndoPayload } from '../db/undo.ts';
import { nullableInstant } from '../shared/clock.ts';
import { ApiFailure } from '../shared/errors.ts';
import { newId } from '../shared/ids.ts';
import { actorParameters, actorSql, administrator } from './projects/index.ts';
import type { ProjectRow, TeamRow } from './read-model.ts';
import { members, teamDto, teamRow } from './read-model.ts';
type MemberRow = typeof workspaceMembers.$inferSelect;
const normalized = (name: string) => name.trim().toLowerCase();

export async function mutateTeam(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  body: CreateTeamInput | UpdateTeamInput,
  now: number,
  id?: EntityId,
) {
  administrator(actor);
  const old = id ? await teamRow(r, s, id) : null;
  if (old && (!('expectedVersion' in body) || old.version !== body.expectedVersion))
    throw new ApiFailure('CONFLICT', 'Team version changed');
  const memberRows = await r.all<MemberRow>('SELECT * FROM workspaceMembers WHERE workspaceId=?', [
    s.workspaceId,
  ]);
  const selected =
    body.memberIds ??
    memberRows
      .filter((m) => m.teamId === id && m.removedAt === null)
      .map((m) => EntityIdSchema.parse(m.id));
  if (selected.some((mid) => !memberRows.some((m) => m.id === mid && m.removedAt === null)))
    throw new ApiFailure('VALIDATION_ERROR', 'Choose workspace members');
  const rootId = id ?? newId(),
    marker = newId(),
    name = body.name ?? old!.name;
  if (
    (
      await r.all(
        'SELECT id FROM teams WHERE workspaceId=? AND nameNormalized=? AND deletedAt IS NULL AND id!=?',
        [s.workspaceId, normalized(name), rootId],
      )
    ).length
  )
    throw new ApiFailure('CONFLICT', 'Team name already exists');
  const changed = memberRows.filter((m) =>
    selected.includes(EntityIdSchema.parse(m.id)) ? m.teamId !== rootId : m.teamId === rootId,
  );
  const otherIds = [
    ...new Set(changed.flatMap((m) => (m.teamId && m.teamId !== rootId ? [m.teamId] : []))),
  ];
  const otherTeams = await r.all<TeamRow>(
    'SELECT * FROM teams WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(otherIds)],
  );
  const scopeGuard = exactSet(
    'workspaceMembers',
    'workspaceId=? AND (teamId=? OR id IN (SELECT value FROM json_each(?)))',
    [s.workspaceId, rootId, JSON.stringify(selected)],
    memberRows.filter((m) => m.teamId === rootId || selected.includes(EntityIdSchema.parse(m.id))),
    ['id', 'version', 'teamId', 'removedAt', 'status'],
  );
  const teamGuard = exactSet(
    'teams',
    'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(otherIds)],
    otherTeams,
    ['id', 'version', 'deletedAt'],
  );
  const guard = {
    sql: `${actorSql('administrator')} AND ${scopeGuard.sql} AND ${teamGuard.sql} AND NOT EXISTS (SELECT 1 FROM teams WHERE workspaceId=? AND nameNormalized=? AND deletedAt IS NULL AND id!=?)`,
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
    icon: body.icon ?? old!.icon,
    color: body.color ?? old!.color,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
    version: (old?.version ?? 0) + 1,
    lastMutationId: marker,
  };
  if (!old) row.description = row.description.trim() || 'No description yet.';
  const gate = { sql: markerSql('teams'), parameters: [rootId, marker] };
  const fields = patchSql({
    name: row.name,
    nameNormalized: row.nameNormalized,
    description: row.description,
    icon: row.icon,
    color: row.color,
    updatedAt: now,
    lastMutationId: marker,
  });
  const statements = [
    old
      ? r.prepare(
          `UPDATE teams SET ${fields.sql},version=version+1 WHERE workspaceId=? AND id=? AND version=? AND deletedAt IS NULL AND ${guard.sql}`,
          [...fields.parameters, s.workspaceId, rootId, old.version, ...guard.parameters],
        )
      : gatedInsert(r, 'teams', [row], guard),
  ];
  if (changed.length)
    statements.push(
      r.prepare(
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
      ),
    );
  if (otherIds.length)
    statements.push(
      r.prepare(
        `UPDATE teams SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
        [now, marker, s.workspaceId, JSON.stringify(otherIds), ...gate.parameters],
      ),
    );
  fitBatch(r, statements.length, 2);
  await matchedBatch(r, statements);
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
) {
  administrator(actor);
  const team = await teamRow(r, s, id);
  if (team.version !== expectedVersion) throw new ApiFailure('CONFLICT', 'Team version changed');
  const ms = await r.all<MemberRow>(
    'SELECT * FROM workspaceMembers WHERE workspaceId=? AND teamId=? ORDER BY id',
    [s.workspaceId, id],
  );
  const ps = await r.all<ProjectRow>(
    'SELECT * FROM projects WHERE workspaceId=? AND teamId=? ORDER BY id',
    [s.workspaceId, id],
  );
  if (1 + ms.length + ps.length > 128)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Team exceeds bounded Undo targets');
  const marker = newId(),
    undoId = newId();
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
  const mg = exactSet('workspaceMembers', 'workspaceId=? AND teamId=?', [s.workspaceId, id], ms, [
    'id',
    'version',
    'teamId',
    'removedAt',
    'status',
  ]);
  const pg = exactSet('projects', 'workspaceId=? AND teamId=?', [s.workspaceId, id], ps, [
    'id',
    'version',
    'teamId',
    'archivedAt',
    'deletedAt',
    'deletedBy',
  ]);
  const gate = { sql: markerSql('teams'), parameters: [id, marker] };
  const statements = [
    r.prepare(
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
    ),
  ];
  for (const [table, rows] of [
    ['workspaceMembers', ms],
    ['projects', ps],
  ] as const)
    if (rows.length)
      statements.push(
        r.prepare(
          `UPDATE ${table} SET teamId=NULL,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
          [
            now,
            marker,
            s.workspaceId,
            JSON.stringify(rows.map((row) => row.id)),
            ...gate.parameters,
          ],
        ),
      );
  statements.push(
    gatedInsert(
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
    ),
  );
  fitBatch(r, statements.length, 1);
  await matchedBatch(r, statements);
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
