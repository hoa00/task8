import type { MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
import { decodeUndoPayload, decodeUndoResult, encodeUndoResult } from '../../../db/undo.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { administrator } from '../../projects/access.ts';
import {
  undoTeamBudget,
  undoTeamCommit,
  undoTeamGuardJson,
  undoTeamGuardJsonResult,
  undoTeamMarkerTeams,
  undoTeamPredicateCommandUndoRecords,
  undoTeamPrepareActivity,
  undoTeamPrepareCommandUndoRecords,
  undoTeamPrepareJson,
  undoTeamPrepareTeams,
  undoTeamReadCommandUndoRecords,
} from '../persistence/undo.ts';

export async function undoTeam(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  record: typeof commandUndoRecords.$inferSelect,
  now: number,
  generateId: IdGenerator = newId,
) {
  const id = record.id,
    payload = decodeUndoPayload(record.payloadJson);
  if (payload.kind !== record.kind) throw new ApiFailure('INTERNAL_ERROR', 'Invalid Undo record');
  if (payload.kind !== 'team.delete') throw new ApiFailure('INTERNAL_ERROR', 'Invalid team Undo');
  administrator(actor);
  if (record.resultJson !== null) return decodeUndoResult(record.resultJson);
  const marker = generateId(),
    pending = undoTeamPredicateCommandUndoRecords(),
    pendingParams = [s.workspaceId, id, s.memberId];
  let affected = {
    taskIds: [] as string[],
    projectIds: [] as string[],
    teamIds: [] as string[],
    memberIds: [] as string[],
    commentIds: [] as string[],
    fileIds: [] as string[],
  };
  const targets = payload.targets,
    team = targets.find((t) => t.entity === 'team');
  if (!team || targets.filter((t) => t.entity === 'team').length !== 1)
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid team Undo');
  const ms = targets.filter((t) => t.entity === 'member'),
    ps = targets.filter((t) => t.entity === 'project');
  const mg = undoTeamGuardJson(s, ms);
  const pg = undoTeamGuardJsonResult(s, ps);
  const gate = { sql: undoTeamMarkerTeams(), parameters: [team.id, marker] };
  const statements = [
    undoTeamPrepareTeams(r, pending, mg, pg, now, marker, s, team, record, pendingParams),
  ];
  for (const [table, rows] of [
    ['workspaceMembers', ms],
    ['projects', ps],
  ] as const)
    if (rows.length)
      statements.push(undoTeamPrepareJson(r, table, gate, team, now, marker, s, rows));
  affected = {
    ...affected,
    teamIds: [team.id],
    memberIds: ms.map((t) => t.id),
    projectIds: ps.map((t) => t.id),
  };
  const result = encodeUndoResult({
    undoId: id,
    kind: payload.kind,
    appliedAt: instant(now),
    affected,
  });
  if (payload.activityIds.length)
    statements.push(undoTeamPrepareActivity(r, gate, now, s, payload));
  statements.push(undoTeamPrepareCommandUndoRecords(r, gate, now, result, s, id));
  undoTeamBudget(r, statements);
  const results = await undoTeamCommit(r, statements);
  if (results[0]?.meta.changes !== 1) {
    const [latest] = await undoTeamReadCommandUndoRecords(r, s, id);
    if (latest?.resultJson) return decodeUndoResult(latest.resultJson);
    throw new ApiFailure('CONFLICT', 'Undo targets changed');
  }
  return decodeUndoResult(result);
}
