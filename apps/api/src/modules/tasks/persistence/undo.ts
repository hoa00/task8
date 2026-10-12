import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { exactSet, fitBatch, gatedInsert, markerSql } from '../../../db/commands.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
import { decodeUndoResult, encodeUndoResult } from '../../../db/undo.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';
import type { TaskProjection } from './model.ts';
import type { TaskUndoPayload } from './undo-model.ts';

const epoch = (value: string | null) => (value === null ? null : Date.parse(value));
export async function commitTaskUndo(
  r: RequestRepository,
  s: WorkspaceContext,
  record: typeof commandUndoRecords.$inferSelect,
  now: number,
  payload: TaskUndoPayload,
  rows: TaskProjection[],
  access: SqlPredicate,
  generateId: IdGenerator,
) {
  const ids = payload.targets.map((t) => t.id);
  const marker = generateId(),
    gate = { sql: markerSql('workspaces'), parameters: [s.workspaceId, marker] },
    guards: SqlPredicate[] = [access];
  const changed = payload.targets.map((target) => {
    const row = requireTask(rows, target.id);
    if ('entity' in target && target.entity === 'dependency') return row;
    if ('entity' in target && target.entity === 'successor') {
      return {
        ...row,
        updatedAt: now,
        deletedAt: now,
        deletedBy: s.memberId,
        recurrenceSourceTaskId: null,
        cancelledByUndoId: record.id,
      };
    }
    if ('status' in target.before) {
      return {
        ...row,
        updatedAt: payload.kind === 'task.complete' ? now : Date.parse(target.before.updatedAt),
        status: target.before.status,
        completedAt: epoch(target.before.completedAt),
        previousStatus: target.before.previousStatus,
      };
    }
    return {
      ...row,
      updatedAt: Date.parse(target.before.updatedAt),
      archivedAt: epoch(target.before.archivedAt),
      deletedAt: epoch(target.before.deletedAt),
      deletedBy: target.before.deletedBy,
    };
  });
  const expected = payload.targets.map((t) => {
    const row = requireTask(rows, t.id);
    if ('entity' in t && t.entity === 'dependency')
      return { ...row, version: t.postVersion, archivedAt: null, deletedAt: null };
    if ('entity' in t && t.entity === 'successor')
      return {
        ...row,
        version: t.postVersion,
        status: 'todo',
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
        deletedBy: null,
        recurrenceSourceTaskId: t.parentId,
      };
    if ('status' in t.before)
      return {
        ...row,
        version: t.postVersion,
        status: 'done',
        completedAt: record.createdAt,
        archivedAt: null,
        deletedAt: null,
      };
    const archive =
      payload.kind === 'task.archive' || payload.kind === 'tasks.archiveCompletedColumn';
    return {
      ...row,
      version: t.postVersion,
      archivedAt: archive ? record.createdAt : epoch(t.before.archivedAt),
      deletedAt: archive ? epoch(t.before.deletedAt) : record.createdAt,
      deletedBy: archive ? t.before.deletedBy : s.memberId,
    };
  });
  guards.push(
    exactSet(
      'tasks',
      'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
      [s.workspaceId, JSON.stringify(ids)],
      expected,
      [
        'id',
        'version',
        'projectId',
        'status',
        'completedAt',
        'archivedAt',
        'deletedAt',
        'deletedBy',
        'recurrenceSourceTaskId',
      ],
    ),
  );
  if (payload.kind === 'tasks.completeColumn') {
    const successors = payload.targets.filter((t) => t.entity === 'successor'),
      successorIds = JSON.stringify(successors.map((t) => t.id));
    if (successors.length) {
      const where = 'workspaceId=? AND taskId IN (SELECT value FROM json_each(?))',
        params = [s.workspaceId, successorIds];
      guards.push(
        exactSet(
          'subtasks',
          where,
          params,
          successors.flatMap((t) => t.children.map((c) => ({ ...c, taskId: t.id }))),
          [
            'id',
            'taskId',
            'title',
            'done',
            'assigneeId',
            'dueDate',
            'note',
            'position',
            'createdAt',
            'updatedAt',
          ],
        ),
        exactSet(
          'taskLabels',
          where,
          params,
          successors.flatMap((t) => t.labelIds.map((labelId) => ({ taskId: t.id, labelId }))),
          ['taskId', 'labelId'],
        ),
        exactSet(
          'taskDependencies',
          where,
          params,
          successors.flatMap((t) =>
            t.dependencyIds.map((dependsOnTaskId) => ({ taskId: t.id, dependsOnTaskId })),
          ),
          ['taskId', 'dependsOnTaskId'],
        ),
      );
      for (const table of ['comments', 'files', 'taskFavorites', 'taskDependencies'])
        guards.push({
          sql: `NOT EXISTS (SELECT 1 FROM ${table} WHERE workspaceId=? AND ${table === 'taskDependencies' ? 'dependsOnTaskId' : 'taskId'} IN (SELECT value FROM json_each(?)))`,
          parameters: params,
        });
    }
  }
  const pending =
    'EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)';
  const statements = [
    r.prepare(
      `UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND ${pending} AND ${guards.map((g) => `(${g.sql})`).join(' AND ')}`,
      [
        marker,
        s.workspaceId,
        ...actorParameters(s),
        s.workspaceId,
        record.id,
        s.memberId,
        ...guards.flatMap((g) => g.parameters),
      ],
    ),
  ];
  if (changed.length) {
    const json = JSON.stringify(changed),
      cols = [
        'updatedAt',
        'status',
        'completedAt',
        'previousStatus',
        'archivedAt',
        'deletedAt',
        'deletedBy',
        'recurrenceSourceTaskId',
        'cancelledByUndoId',
      ];
    statements.push(
      r.prepare(
        `UPDATE tasks SET ${cols.map((c) => `${c}=(SELECT json_extract(value,'$.${c}') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id)`).join(',')},version=version+1,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${gate.sql}`,
        [...cols.map(() => json), marker, s.workspaceId, json, ...gate.parameters],
      ),
    );
  }
  const result = encodeUndoResult({
    undoId: record.id,
    kind: payload.kind,
    appliedAt: instant(now),
    affected: {
      taskIds: rows.map((t) => t.id),
      projectIds: [...new Set(rows.map((t) => t.projectId))],
      teamIds: [],
      memberIds: [],
      commentIds: [],
      fileIds: [],
    },
  });
  if (payload.kind === 'task.complete') {
    const t = changed[0];
    if (!t) throw new ApiFailure('INTERNAL_ERROR', 'Missing completion Undo task');
    statements.push(
      gatedInsert(
        r,
        'activity',
        [
          {
            id: generateId(),
            workspaceId: s.workspaceId,
            projectId: t.projectId,
            taskId: t.id,
            actorId: s.memberId,
            eventType: 'task.moved',
            payloadJson: JSON.stringify({
              taskTitle: t.title,
              previousStatus: 'done',
              status: t.status,
            }),
            commandId: marker,
            revertedAt: null,
            createdAt: now,
          },
        ],
        gate,
      ),
    );
  } else if (payload.activityIds.length)
    statements.push(
      r.prepare(
        `UPDATE activity SET revertedAt=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND commandId IS NOT NULL AND ${gate.sql}`,
        [now, s.workspaceId, JSON.stringify(payload.activityIds), ...gate.parameters],
      ),
    );
  statements.push(
    r.prepare(
      `UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL AND ${gate.sql}`,
      [now, result, s.workspaceId, record.id, s.memberId, ...gate.parameters],
    ),
  );
  fitBatch(r, statements.length, 1);
  const results = await r.batch(statements);
  if (results[0]?.meta.changes !== 1) {
    const [latest] = await r.all<{ resultJson: string | null }>(
      'SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
      [s.workspaceId, record.id, s.memberId],
    );
    if (latest?.resultJson) return decodeUndoResult(latest.resultJson);
    throw new ApiFailure('CONFLICT', 'Undo task scope changed');
  }
  return decodeUndoResult(result);
}
function requireTask(rows: TaskProjection[], id: string): TaskProjection {
  const task = rows.find((t) => t.id === id);
  if (!task) throw new ApiFailure('INTERNAL_ERROR', 'Missing Undo target');
  return task;
}
