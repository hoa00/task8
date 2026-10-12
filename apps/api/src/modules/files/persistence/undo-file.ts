import type { $brand } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch } from '../../../db/commands.ts';
import { actorParameters, actorSql, writeAccessSql } from '../../projects/index.ts';
import type { FileRow } from './model.ts';

export function undoFileReadFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  t: {
    before: {
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      deletedBy: (string & $brand<'EntityId'>) | null;
      updatedAt: string & $brand<'Instant'>;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
    projectId: string & $brand<'EntityId'>;
    taskId: (string & $brand<'EntityId'>) | null;
    parentPostVersion: number;
  },
) {
  return r.all<FileRow>('SELECT * FROM files WHERE workspaceId=? AND id=?', [s.workspaceId, t.id]);
}
export function undoFileReadFilesResult(
  r: RequestRepository,
  s: WorkspaceContext,
  t: {
    before: {
      archivedAt: (string & $brand<'Instant'>) | null;
      deletedAt: (string & $brand<'Instant'>) | null;
      deletedBy: (string & $brand<'EntityId'>) | null;
      updatedAt: string & $brand<'Instant'>;
    };
    id: string & $brand<'EntityId'>;
    postVersion: number;
    projectId: string & $brand<'EntityId'>;
    taskId: (string & $brand<'EntityId'>) | null;
    parentPostVersion: number;
  },
) {
  return r.all<FileRow>('SELECT * FROM files WHERE workspaceId=? AND id=?', [s.workspaceId, t.id]);
}
export function undoFileReadTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  current: {
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
) {
  return r.all<{
    id: string;
    projectId: string;
    version: number;
    archivedAt: number | null;
    deletedAt: number | null;
  }>('SELECT id,projectId,version,archivedAt,deletedAt FROM tasks WHERE workspaceId=? AND id=?', [
    s.workspaceId,
    current.taskId,
  ]);
}
export function undoFilePredicateFiles() {
  return 'EXISTS (SELECT 1 FROM files WHERE workspaceId=? AND id=? AND version=? AND deletedAt=? AND deletedBy=?) AND EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)';
}
export function undoFilePrepareFiles(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  marker: string & $brand<'EntityId'>,
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
) {
  return r.prepare(
    `UPDATE files SET deletedAt=NULL,deletedBy=NULL,updatedAt=?,version=version+1,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,
    [now, marker, s.workspaceId, old.id, ...gate.parameters],
  );
}
export function undoFilePrepareActivity(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  s: WorkspaceContext,
  payload: {
    kind: 'file.delete';
    targets: {
      before: {
        archivedAt: (string & $brand<'Instant'>) | null;
        deletedAt: (string & $brand<'Instant'>) | null;
        deletedBy: (string & $brand<'EntityId'>) | null;
        updatedAt: string & $brand<'Instant'>;
      };
      id: string & $brand<'EntityId'>;
      postVersion: number;
      projectId: string & $brand<'EntityId'>;
      taskId: (string & $brand<'EntityId'>) | null;
      parentPostVersion: number;
    }[];
    activityIds: (string & $brand<'EntityId'>)[];
  },
) {
  return r.prepare(
    `UPDATE activity SET revertedAt=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
    [now, s.workspaceId, JSON.stringify(payload.activityIds), ...gate.parameters],
  );
}
export function undoFilePrepareCommandUndoRecords(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  result: string,
  s: WorkspaceContext,
  record: {
    id: string;
    workspaceId: string;
    createdAt: number;
    kind: string;
    payloadJson: string;
    actorMemberId: string;
    payloadVersion: number;
    consumedAt: number | null;
    resultJson: string | null;
  },
) {
  return r.prepare(
    `UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND consumedAt IS NULL AND ${gate.sql}`,
    [now, result, s.workspaceId, record.id, ...gate.parameters],
  );
}
export function undoFilePrepareProjects(
  r: RequestRepository,
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
) {
  return r.prepare(
    `SELECT ${actorSql()} actorValid,EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) projectValid`,
    [...actorParameters(s), s.workspaceId, old.projectId, s.memberId],
  );
}
export function undoFileBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 5);
}
export function undoFileCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return r.batch<{ actorValid: number; projectValid: number }>(statements);
}
export function undoFileReadCommandUndoRecords(
  r: RequestRepository,
  s: WorkspaceContext,
  record: {
    id: string;
    workspaceId: string;
    createdAt: number;
    kind: string;
    payloadJson: string;
    actorMemberId: string;
    payloadVersion: number;
    consumedAt: number | null;
    resultJson: string | null;
  },
) {
  return r.all<{ resultJson: string | null }>(
    'SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
    [s.workspaceId, record.id, s.memberId],
  );
}
