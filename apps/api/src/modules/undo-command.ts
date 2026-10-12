import type { EntityId, MemberDto } from '@studio/contracts/api';
import { exactSet } from '../db/commands.ts';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { commandUndoRecords } from '../db/schema.ts';
import { decodeUndoPayload, decodeUndoResult, encodeUndoResult } from '../db/undo.ts';
import { ApiFailure } from '../shared/errors.ts';
import { undoComment } from './comments.ts';
import { undoFile } from './files.ts';
import { projectRow, writeAccessSql } from './read-model.ts';
import {
  actorParameters,
  actorSql,
  administrator,
  fitBatch,
  instant,
  markerSql,
  newId,
} from './shared.ts';
import { undoTasks } from './task-undo.ts';
const epoch = (value: string | null) => (value === null ? null : Date.parse(value));
export async function undoCommand(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  id: EntityId,
  now: number,
  bucket: R2Bucket,
) {
  const [record] = await r.all<typeof commandUndoRecords.$inferSelect>(
    'SELECT * FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
    [s.workspaceId, id, s.memberId],
  );
  if (!record) throw new ApiFailure('NOT_FOUND', 'Undo not found');
  if (record.kind === 'file.delete') return undoFile(r, s, record, now, bucket);
  if (record.kind === 'comment.delete') return undoComment(r, s, record, now);
  if (
    [
      'task.complete',
      'task.archive',
      'task.delete',
      'tasks.bulkDelete',
      'tasks.completeColumn',
      'tasks.archiveCompletedColumn',
    ].includes(record.kind)
  )
    return undoTasks(r, s, record, now);
  if (!['project.archive', 'project.delete', 'team.delete'].includes(record.kind))
    throw new ApiFailure('CAPABILITY_UNAVAILABLE', 'Undo kind is not implemented');
  const payload = decodeUndoPayload(record.payloadJson);
  if (payload.kind !== record.kind) throw new ApiFailure('INTERNAL_ERROR', 'Invalid Undo record');
  const root = payload.targets[0]!;
  if (payload.kind === 'team.delete') administrator(actor);
  else await projectRow(r, s, root.id, false, true, true);
  if (record.resultJson !== null) return decodeUndoResult(record.resultJson);
  const marker = newId(),
    pending = `EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)`,
    pendingParams = [s.workspaceId, id, s.memberId];
  let statements: D1PreparedStatement[],
    gate: { sql: string; parameters: (string | number | null)[] },
    affected = {
      taskIds: [] as string[],
      projectIds: [] as string[],
      teamIds: [] as string[],
      memberIds: [] as string[],
      commentIds: [] as string[],
      fileIds: [] as string[],
    };
  if (payload.kind === 'team.delete') {
    const targets = payload.targets,
      team = targets.find((t) => t.entity === 'team');
    if (!team || targets.filter((t) => t.entity === 'team').length !== 1)
      throw new ApiFailure('INTERNAL_ERROR', 'Invalid team Undo');
    const ms = targets.filter((t) => t.entity === 'member'),
      ps = targets.filter((t) => t.entity === 'project');
    const mg = exactSet(
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
    const pg = exactSet(
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
    gate = { sql: markerSql('teams'), parameters: [team.id, marker] };
    statements = [
      r.prepare(
        `UPDATE teams SET deletedAt=NULL,deletedBy=NULL,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND version=? AND deletedAt=? AND deletedBy=? AND nameNormalized=? AND ${pending} AND ${actorSql(true)} AND ${mg.sql} AND ${pg.sql} AND NOT EXISTS (SELECT 1 FROM teams reuse WHERE reuse.workspaceId=? AND reuse.id!=? AND reuse.nameNormalized=? AND reuse.deletedAt IS NULL)`,
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
      ),
    ];
    for (const [table, rows] of [
      ['workspaceMembers', ms],
      ['projects', ps],
    ] as const)
      if (rows.length)
        statements.push(
          r.prepare(
            `UPDATE ${table} SET teamId=?,version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
            [
              team.id,
              now,
              marker,
              s.workspaceId,
              JSON.stringify(rows.map((t) => t.id)),
              ...gate.parameters,
            ],
          ),
        );
    affected = {
      ...affected,
      teamIds: [team.id],
      memberIds: ms.map((t) => t.id),
      projectIds: ps.map((t) => t.id),
    };
  } else if (payload.kind === 'project.archive' || payload.kind === 'project.delete') {
    const t = payload.targets[0]!,
      before = t.before;
    gate = { sql: markerSql('projects'), parameters: [t.id, marker] };
    statements = [
      r.prepare(
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
      ),
    ];
    affected.projectIds = [t.id];
  } else throw new ApiFailure('CAPABILITY_UNAVAILABLE', 'Undo kind is not implemented');
  const result = encodeUndoResult({
    undoId: id,
    kind: payload.kind,
    appliedAt: instant(now),
    affected,
  });
  if (payload.activityIds.length)
    statements.push(
      r.prepare(
        `UPDATE activity SET revertedAt=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND commandId IS NOT NULL AND ${gate.sql}`,
        [now, s.workspaceId, JSON.stringify(payload.activityIds), ...gate.parameters],
      ),
    );
  statements.push(
    r.prepare(
      `UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL AND ${gate.sql}`,
      [now, result, s.workspaceId, id, s.memberId, ...gate.parameters],
    ),
  );
  fitBatch(r, statements.length, 1);
  const results = await r.batch(statements);
  if (results[0]?.meta.changes !== 1) {
    const [latest] = await r.all<{ resultJson: string | null }>(
      'SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
      [s.workspaceId, id, s.memberId],
    );
    if (latest?.resultJson) return decodeUndoResult(latest.resultJson);
    throw new ApiFailure('CONFLICT', 'Undo targets changed');
  }
  return decodeUndoResult(result);
}
