import type { UndoResultDto } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
import { decodeUndoPayload, decodeUndoResult, encodeUndoResult } from '../../../db/undo.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { FileStorage } from '../../../storage/r2.ts';
import { projectRow } from '../../projects/access.ts';
import { currentActor } from '../persistence/reads.ts';
import { rootGate } from '../persistence/root.ts';
import {
  undoFileBudget,
  undoFileCommit,
  undoFilePredicateFiles,
  undoFilePrepareActivity,
  undoFilePrepareCommandUndoRecords,
  undoFilePrepareFiles,
  undoFilePrepareProjects,
  undoFileReadCommandUndoRecords,
  undoFileReadFiles,
  undoFileReadFilesResult,
  undoFileReadTasks,
} from '../persistence/undo-file.ts';
import { available } from './replay.ts';
export async function undoFile(
  r: RequestRepository,
  s: WorkspaceContext,
  record: typeof commandUndoRecords.$inferSelect,
  now: number,
  bucket: FileStorage,
  generateId: IdGenerator = newId,
): Promise<UndoResultDto> {
  const payload = decodeUndoPayload(record.payloadJson);
  if (payload.kind !== 'file.delete') throw new ApiFailure('INTERNAL_ERROR', 'Invalid file Undo');
  const t = required(payload.targets[0], 'Missing file invariant'),
    [old] = await undoFileReadFiles(r, s, t);
  if (!old) throw new ApiFailure('NOT_FOUND', 'File not found');
  if (old.projectId !== t.projectId || old.taskId !== t.taskId)
    throw new ApiFailure('CONFLICT', 'File association changed');
  async function currentParent() {
    const [current] = await undoFileReadFilesResult(r, s, t);
    if (!current) throw new ApiFailure('NOT_FOUND', 'File not found');
    if (current.projectId !== t.projectId || current.taskId !== t.taskId)
      throw new ApiFailure('CONFLICT', 'File association changed');
    const project = await projectRow(r, s, EntityIdSchema.parse(current.projectId), {
      visibility: 'detail',
      lifecycle: 'including-deleted',
      access: 'write',
    });
    if (project.archivedAt !== null || project.deletedAt !== null)
      throw new ApiFailure('CONFLICT', 'Undo parent lifecycle changed');
    if (current.taskId) {
      const [task] = await undoFileReadTasks(r, s, current);
      if (
        !task ||
        task.projectId !== current.projectId ||
        task.archivedAt !== null ||
        task.deletedAt !== null
      )
        throw new ApiFailure('CONFLICT', 'Undo task lifecycle or association changed');
      return { table: 'tasks' as const, id: task.id, version: task.version };
    }
    return { table: 'projects' as const, id: project.id, version: project.version };
  }
  const p = await currentParent();
  if (record.resultJson !== null) {
    await currentActor(r, s);
    return decodeUndoResult(record.resultJson);
  }
  await available(bucket, old);
  const marker = generateId(),
    guard = {
      sql: undoFilePredicateFiles(),
      parameters: [
        s.workspaceId,
        t.id,
        t.postVersion,
        record.createdAt,
        s.memberId,
        s.workspaceId,
        record.id,
        s.memberId,
      ],
    };
  const { root, gate } = rootGate(
      r,
      s,
      p,
      old.projectId,
      marker,
      now,
      [guard],
      t.parentPostVersion,
    ),
    result = encodeUndoResult({
      undoId: record.id,
      kind: 'file.delete',
      appliedAt: instant(now),
      affected: {
        taskIds: old.taskId ? [old.taskId] : [],
        projectIds: [old.projectId],
        teamIds: [],
        memberIds: [],
        commentIds: [],
        fileIds: [old.id],
      },
    });
  const statements = [
    root,
    undoFilePrepareFiles(r, gate, now, marker, s, old),
    undoFilePrepareActivity(r, gate, now, s, payload),
    undoFilePrepareCommandUndoRecords(r, gate, now, result, s, record),
    undoFilePrepareProjects(r, s, old),
  ];
  undoFileBudget(r, statements);
  const results = await undoFileCommit(r, statements);
  if (results[0]?.meta.changes !== 1) {
    const auth = results.at(-1)?.results[0];
    if (!auth?.actorValid)
      throw new ApiFailure('CONFLICT', 'File Undo actor authorization changed');
    await currentActor(r, s);
    await currentParent();
    if (!auth.projectValid)
      throw new ApiFailure('FORBIDDEN', 'File Undo project authorization changed');
    const [latest] = await undoFileReadCommandUndoRecords(r, s, record);
    if (latest?.resultJson) return decodeUndoResult(latest.resultJson);
    throw new ApiFailure('CONFLICT', 'File Undo targets changed');
  }
  return decodeUndoResult(result);
}
