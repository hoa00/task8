import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { fileReadTextKeys } from '../domain/read-text.ts';
import type { EntityId } from '@studio/contracts/api';
import type { $brand } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch, gatedInsert } from '../../../db/commands.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { actorParameters, actorSql } from '../../projects/index.ts';

export function uploadFilePredicateFiles() {
  return 'NOT EXISTS (SELECT 1 FROM files WHERE workspaceId=? AND createdBy=? AND uploadRequestId=?)';
}
export function uploadFileInsertFiles(
  r: RequestRepository,
  f: {
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
  gate: { sql: string; parameters: string[] },
) {
  return gatedInsert(r, 'files', [{ ...f, readKeys: fileReadTextKeys(f, textKeyEncoder) }], gate);
}
export function uploadFileInsertActivity(
  r: RequestRepository,
  generateId: IdGenerator,
  s: WorkspaceContext,
  f: {
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
  marker: string & $brand<'EntityId'>,
  now: number,
  gate: { sql: string; parameters: string[] },
  projectId: EntityId,
) {
  return gatedInsert(
    r,
    'activity',
    [
      {
        id: generateId(),
        workspaceId: s.workspaceId,
        projectId,
        taskId: f.taskId,
        actorId: s.memberId,
        eventType: 'file.created',
        payloadJson: JSON.stringify({ fileName: f.name }),
        commandId: marker,
        revertedAt: null,
        createdAt: now,
      },
    ],
    gate,
  );
}
export function uploadFilePrepareFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  input: {
    file: { name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> };
    clientRequestId: string;
    taskId?: (string & $brand<'EntityId'>) | undefined;
  },
) {
  return r.prepare(
    `SELECT f.*,${actorSql()} actorValid FROM files f WHERE workspaceId=? AND createdBy=? AND uploadRequestId=?`,
    [...actorParameters(s), s.workspaceId, s.memberId, input.clientRequestId],
  );
}
export function uploadFileBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 5);
}
