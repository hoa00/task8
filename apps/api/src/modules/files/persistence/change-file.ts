import type { $brand } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch, gatedInsert } from '../../../db/commands.ts';
import { required } from '../../../shared/errors.ts';
export function changeFilePredicateFiles() {
  return 'EXISTS (SELECT 1 FROM files WHERE workspaceId=? AND id=? AND projectId=? AND taskId IS ? AND version=? AND deletedAt IS ? AND deletedBy IS ?)';
}
export function changeFileInsertFiles(
  r: RequestRepository,
  row: {
    createdAt: number;
    createdBy: string;
    uploadRequestId: string | null;
    uploadRequestHash: string | null;
    objectKey: string | null;
    id: string & $brand<'EntityId'>;
    name: string;
    updatedAt: number;
    version: number;
    lastMutationId: string & $brand<'EntityId'>;
    deletedAt: number | null;
    deletedBy: (string & $brand<'EntityId'>) | null;
    workspaceId: string;
    projectId: string;
    taskId: string | null;
    fileType: string;
    mimeType: string | null;
    sizeBytes: number | null;
    displaySize: string;
    storageMode: string;
    contentSha256: string | null;
  },
  gate: { sql: string; parameters: string[] },
) {
  return gatedInsert(r, 'files', [row], gate);
}
export function changeFilePrepareFiles(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  row: {
    createdAt: number;
    createdBy: string;
    uploadRequestId: string | null;
    uploadRequestHash: string | null;
    objectKey: string | null;
    id: string & $brand<'EntityId'>;
    name: string;
    updatedAt: number;
    version: number;
    lastMutationId: string & $brand<'EntityId'>;
    deletedAt: number | null;
    deletedBy: (string & $brand<'EntityId'>) | null;
    workspaceId: string;
    projectId: string;
    taskId: string | null;
    fileType: string;
    mimeType: string | null;
    sizeBytes: number | null;
    displaySize: string;
    storageMode: string;
    contentSha256: string | null;
  },
  now: number,
  marker: string & $brand<'EntityId'>,
  s: WorkspaceContext,
  id: string & $brand<'EntityId'>,
) {
  return r.prepare(
    `UPDATE files SET name=?,fileType=?,version=version+1,updatedAt=?,deletedAt=?,deletedBy=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,
    [
      row.name,
      row.fileType,
      now,
      row.deletedAt,
      row.deletedBy,
      marker,
      s.workspaceId,
      id,
      ...gate.parameters,
    ],
  );
}
export function changeFileInsertActivity(
  r: RequestRepository,
  eventId: string & $brand<'EntityId'>,
  s: WorkspaceContext,
  old: {
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    version: number;
    lastMutationId: string | null;
    projectId: string;
    taskId: string | null;
    fileType: string;
    mimeType: string | null;
    sizeBytes: number | null;
    displaySize: string;
    storageMode: string;
    objectKey: string | null;
    contentSha256: string | null;
    uploadRequestId: string | null;
    uploadRequestHash: string | null;
    createdBy: string;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  operation: 'rename' | 'delete' | 'restore' | 'duplicate',
  row: {
    createdAt: number;
    createdBy: string;
    uploadRequestId: string | null;
    uploadRequestHash: string | null;
    objectKey: string | null;
    id: string & $brand<'EntityId'>;
    name: string;
    updatedAt: number;
    version: number;
    lastMutationId: string & $brand<'EntityId'>;
    deletedAt: number | null;
    deletedBy: (string & $brand<'EntityId'>) | null;
    workspaceId: string;
    projectId: string;
    taskId: string | null;
    fileType: string;
    mimeType: string | null;
    sizeBytes: number | null;
    displaySize: string;
    storageMode: string;
    contentSha256: string | null;
  },
  marker: string & $brand<'EntityId'>,
  now: number,
  gate: { sql: string; parameters: string[] },
) {
  return gatedInsert(
    r,
    'activity',
    [
      {
        id: eventId,
        workspaceId: s.workspaceId,
        projectId: old.projectId,
        taskId: old.taskId,
        actorId: s.memberId,
        eventType:
          operation === 'delete'
            ? 'file.deleted'
            : operation === 'duplicate'
              ? 'file.created'
              : 'file.updated',
        payloadJson: JSON.stringify({ fileName: row.name }),
        commandId: marker,
        revertedAt: null,
        createdAt: now,
      },
    ],
    gate,
  );
}
export function changeFilePrepareCommandUndoRecords(
  r: RequestRepository,
  p:
    | { table: 'projects'; id: string; version: number }
    | { id: string; version: number; table: 'tasks' },
  gate: { sql: string; parameters: string[] },
  undo: { id: string & $brand<'EntityId'>; kind: 'file.delete' },
  s: WorkspaceContext,
  payload: string | null,
  id: string & $brand<'EntityId'>,
  now: number,
) {
  return r.prepare(
    `INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt,consumedAt,resultJson) SELECT ?,?,?,?,1,json_set(?,'$.targets[0].postVersion',(SELECT version FROM files WHERE workspaceId=? AND id=?),'$.targets[0].parentPostVersion',(SELECT version FROM ${p.table} WHERE workspaceId=? AND id=?)),?,NULL,NULL WHERE ${gate.sql}`,
    [
      undo.id,
      s.workspaceId,
      s.memberId,
      undo.kind,
      required(payload, 'Missing file invariant'),
      s.workspaceId,
      id,
      s.workspaceId,
      p.id,
      now,
      ...gate.parameters,
    ],
  );
}
export function changeFilePrepareFilesResult(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  s: WorkspaceContext,
  copyId: string & $brand<'EntityId'>,
) {
  return r.prepare(`SELECT * FROM files WHERE workspaceId=? AND id=? AND ${gate.sql}`, [
    s.workspaceId,
    copyId,
    ...gate.parameters,
  ]);
}
export function changeFileBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 2);
}
