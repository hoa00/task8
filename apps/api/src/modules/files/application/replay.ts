import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { DiagnosticReporter } from '../../../shared/diagnostics.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { FileStorage } from '../../../storage/r2.ts';
import { fileDto } from '../mapper.ts';
import type { FileIntentProjection, FileRow } from '../persistence/model.ts';
import { currentActor, fileRow } from '../persistence/reads.ts';
import { parent } from './parent.ts';
export async function available(bucket: FileStorage, f: FileRow) {
  if (f.storageMode === 'r2' && (!f.objectKey || !(await bucket.head(f.objectKey))))
    throw new ApiFailure('INTERNAL_ERROR', 'File bytes are unavailable; retry the same intent');
}
export async function cleanup(bucket: FileStorage, f: FileRow, report: DiagnosticReporter) {
  const key = required(f.objectKey, 'Missing owned file object key');
  const outcome = await bucket.delete(key);
  if (outcome.kind === 'unconfirmed-delete') {
    report({
      phase: 'r2-cleanup-unconfirmed',
      errorCode: 'INTERNAL_ERROR',
      fileId: f.id,
      cause: outcome.cause,
    });
    throw new ApiFailure('INTERNAL_ERROR', 'File cleanup is unconfirmed; retry the same intent');
  }
}
export async function replay(
  r: RequestRepository,
  s: WorkspaceContext,
  bucket: FileStorage,
  f: FileIntentProjection,
  hash: string,
) {
  if (f.actorValid === 0) throw new ApiFailure('CONFLICT', 'Upload actor authorization changed');
  await currentActor(r, s);
  if (f.uploadRequestHash !== hash)
    throw new ApiFailure('CONFLICT', 'Upload intent payload changed');
  const current = await fileRow(r, s, EntityIdSchema.parse(f.id));
  await parent(r, s, current.projectId, current.taskId);
  await available(bucket, current);
  return fileDto(current);
}
