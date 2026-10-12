import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
import { decodeUndoPayload, decodeUndoResult, encodeUndoResult } from '../../../db/undo.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { projectRow } from '../access.ts';
import {
  undoProjectBudget,
  undoProjectCommit,
  undoProjectMarkerProjects,
  undoProjectPredicateCommandUndoRecords,
  undoProjectPrepareActivity,
  undoProjectPrepareCommandUndoRecords,
  undoProjectPrepareProjects,
  undoProjectReadCommandUndoRecords,
} from '../persistence/undo.ts';

export async function undoProject(
  r: RequestRepository,
  s: WorkspaceContext,
  record: typeof commandUndoRecords.$inferSelect,
  now: number,
  generateId: IdGenerator = newId,
) {
  const id = record.id,
    payload = decodeUndoPayload(record.payloadJson);
  if (payload.kind !== record.kind) throw new ApiFailure('INTERNAL_ERROR', 'Invalid Undo record');
  if (payload.kind !== 'project.archive' && payload.kind !== 'project.delete')
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid project Undo');
  const root = required(payload.targets[0], 'Missing project Undo target');
  await projectRow(r, s, root.id, {
    visibility: 'detail',
    lifecycle: 'including-deleted',
    access: 'write',
  });
  if (record.resultJson !== null) return decodeUndoResult(record.resultJson);
  const marker = generateId(),
    pending = undoProjectPredicateCommandUndoRecords(),
    pendingParams = [s.workspaceId, id, s.memberId];
  const affected = {
    taskIds: [] as string[],
    projectIds: [] as string[],
    teamIds: [] as string[],
    memberIds: [] as string[],
    commentIds: [] as string[],
    fileIds: [] as string[],
  };
  const t = root,
    before = t.before;
  const gate = { sql: undoProjectMarkerProjects(), parameters: [t.id, marker] };
  const statements = [
    undoProjectPrepareProjects(
      r,
      pending,
      before,
      now,
      marker,
      s,
      t,
      payload,
      record,
      pendingParams,
    ),
  ];
  affected.projectIds = [t.id];
  const result = encodeUndoResult({
    undoId: id,
    kind: payload.kind,
    appliedAt: instant(now),
    affected,
  });
  if (payload.activityIds.length)
    statements.push(undoProjectPrepareActivity(r, gate, now, s, payload));
  statements.push(undoProjectPrepareCommandUndoRecords(r, gate, now, result, s, id));
  undoProjectBudget(r, statements);
  const results = await undoProjectCommit(r, statements);
  if (results[0]?.meta.changes !== 1) {
    const [latest] = await undoProjectReadCommandUndoRecords(r, s, id);
    if (latest?.resultJson) return decodeUndoResult(latest.resultJson);
    throw new ApiFailure('CONFLICT', 'Undo targets changed');
  }
  return decodeUndoResult(result);
}
