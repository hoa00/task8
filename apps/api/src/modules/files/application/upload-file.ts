import type { EntityId, FileDto, UploadProjectFileInput } from '@studio/contracts/api';
import { displayFileSize, sourceFileType } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { DiagnosticReporter } from '../../../shared/diagnostics.ts';
import { defaultDiagnosticReporter } from '../../../shared/diagnostics.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { FileStorage } from '../../../storage/r2.ts';
import { validateBytes } from '../domain/bytes.ts';
import { digest } from '../domain/digest.ts';
import type { FileRow } from '../persistence/model.ts';
import { intent } from '../persistence/reads.ts';
import { rootGate } from '../persistence/root.ts';
import {
  uploadFileBudget,
  uploadFileInsertActivity,
  uploadFileInsertFiles,
  uploadFilePredicateFiles,
  uploadFilePrepareFiles,
} from '../persistence/upload-file.ts';
import { parent } from './parent.ts';
import { cleanup, replay } from './replay.ts';
import { uploadOutcome } from './upload-outcome.ts';
export interface FileUploadResult {
  file: FileDto;
  created: boolean;
}
export async function uploadFile(
  r: RequestRepository,
  s: WorkspaceContext,
  bucket: FileStorage,
  projectId: EntityId,
  input: UploadProjectFileInput,
  now: number,
  generateId: IdGenerator = newId,
  report: DiagnosticReporter = defaultDiagnosticReporter,
): Promise<FileUploadResult> {
  const p = await parent(r, s, projectId, input.taskId ?? null);
  validateBytes(input.file);
  const mime = input.file.mimeType.toLowerCase(),
    contentSha256 = await digest(input.file.bytes),
    requestHash = await digest(
      new TextEncoder().encode(
        JSON.stringify({
          projectId,
          taskId: input.taskId ?? null,
          name: input.file.name.trim(),
          mime,
          actualSize: input.file.bytes.byteLength,
          contentSha256,
        }),
      ),
    );
  const existing = await intent(r, s, input.clientRequestId);
  if (existing) return { file: await replay(r, s, bucket, existing, requestHash), created: false };
  const id = generateId(),
    marker = generateId(),
    f: FileRow = {
      id,
      workspaceId: s.workspaceId,
      projectId,
      taskId: input.taskId ?? null,
      name: input.file.name.trim(),
      fileType: sourceFileType(input.file.name),
      mimeType: mime,
      sizeBytes: input.file.bytes.byteLength,
      displaySize: displayFileSize(input.file.bytes.byteLength),
      storageMode: 'r2',
      objectKey: `workspaces/${s.workspaceId}/projects/${projectId}/files/${id}`,
      contentSha256,
      uploadRequestId: input.clientRequestId,
      uploadRequestHash: requestHash,
      createdBy: s.memberId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      lastMutationId: marker,
    };
  const unique = {
    sql: uploadFilePredicateFiles(),
    parameters: [s.workspaceId, s.memberId, input.clientRequestId],
  };
  const { root, gate } = rootGate(r, s, p, projectId, marker, now, [unique], null),
    statements = [
      root,
      uploadFileInsertFiles(r, f, gate),
      uploadFileInsertActivity(r, generateId, s, f, marker, now, gate, projectId),
      uploadFilePrepareFiles(r, s, input),
    ];
  uploadFileBudget(r, statements);
  const write = await bucket.put(
    required(f.objectKey, 'Missing upload object key'),
    input.file.bytes,
    {
      httpMetadata: { contentType: mime },
      customMetadata: { contentSha256, requestId: input.clientRequestId },
    },
  );
  if (write.kind === 'unconfirmed-write') {
    report({
      phase: 'r2-put-unconfirmed',
      errorCode: 'INTERNAL_ERROR',
      fileId: id,
      cause: write.cause,
    });
    throw new ApiFailure(
      'INTERNAL_ERROR',
      'File bytes could not be confirmed; retry the same intent',
    );
  }
  const outcome = await uploadOutcome(r, s, statements, f, input.clientRequestId);
  switch (outcome.kind) {
    case 'confirmed-own-winner':
      return {
        file: await replay(r, s, bucket, outcome.winner, requestHash),
        created: outcome.created,
      };
    case 'confirmed-other-winner':
      await cleanup(bucket, f, report);
      return { file: await replay(r, s, bucket, outcome.winner, requestHash), created: false };
    case 'confirmed-no-winner':
      await cleanup(bucket, f, report);
      throw new ApiFailure('CONFLICT', 'Upload scope changed');
    case 'confirmed-rollback':
      await cleanup(bucket, f, report);
      throw outcome.cause;
    case 'unconfirmed-commit':
      report({
        phase: 'd1-commit-unconfirmed',
        errorCode: 'INTERNAL_ERROR',
        fileId: id,
        cause: outcome.cause,
      });
      throw new ApiFailure(
        'INTERNAL_ERROR',
        'Upload outcome is unconfirmed; retry the same intent',
      );
  }
}
