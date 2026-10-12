import type { EntityId, FileMutationDto } from '@studio/contracts/api';
import { sourceFileType } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { encodeUndoPayload } from '../../../db/undo.ts';
import { instant } from '../../../shared/clock.ts';
import type { DiagnosticReporter } from '../../../shared/diagnostics.ts';
import { defaultDiagnosticReporter } from '../../../shared/diagnostics.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { FileStorage } from '../../../storage/r2.ts';
import { invalidName } from '../domain/bytes.ts';
import { fileDto } from '../mapper.ts';
import type { FileChangeCommand } from '../persistence/change-file-model.ts';
import {
  changeFileBudget,
  changeFileInsertActivity,
  changeFileInsertFiles,
  changeFilePredicateFiles,
  changeFilePrepareCommandUndoRecords,
  changeFilePrepareFiles,
  changeFilePrepareFilesResult,
} from '../persistence/change-file.ts';
import { currentActor, fileRow } from '../persistence/reads.ts';
import { rootGate } from '../persistence/root.ts';
import type { FileMutationAttempt } from './change-outcome.ts';
import { fileMutationOutcome } from './change-outcome.ts';
import { parent } from './parent.ts';
import { available, cleanup } from './replay.ts';

export async function changeFile(
  r: RequestRepository,
  s: WorkspaceContext,
  bucket: FileStorage,
  id: EntityId,
  command: FileChangeCommand,
  now: number,
  generateId: IdGenerator = newId,
  report: DiagnosticReporter = defaultDiagnosticReporter,
): Promise<FileMutationDto> {
  const operation = command.kind,
    expectedVersion = command.expectedVersion,
    name = 'name' in command ? command.name : undefined;
  const old = await fileRow(r, s, id, operation === 'restore'),
    p = await parent(r, s, old.projectId, old.taskId);
  if (
    old.version !== expectedVersion ||
    (operation === 'restore' && (old.deletedAt === null || old.deletedBy !== s.memberId))
  )
    throw new ApiFailure('CONFLICT', 'File version or lifecycle changed');
  if (operation === 'restore' || operation === 'duplicate') await available(bucket, old);
  if (name !== undefined && invalidName(name))
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid file name');
  const marker = generateId(),
    copyId = operation === 'duplicate' ? generateId() : id;
  const row = {
    ...old,
    id: copyId,
    name:
      name ?? (operation === 'duplicate' ? old.name.replace(/(\.[^.]+)$/u, ' copy$1') : old.name),
    updatedAt: now,
    version: operation === 'duplicate' ? 1 : old.version + 1,
    lastMutationId: marker,
    deletedAt: operation === 'delete' ? now : null,
    deletedBy: operation === 'delete' ? s.memberId : null,
    ...(operation === 'duplicate'
      ? {
          createdAt: now,
          createdBy: s.memberId,
          uploadRequestId: null,
          uploadRequestHash: null,
          objectKey:
            old.storageMode === 'r2'
              ? `workspaces/${s.workspaceId}/projects/${old.projectId}/files/${copyId}`
              : null,
        }
      : {}),
  };
  row.fileType = sourceFileType(row.name);
  fileDto(row);
  const guard = {
    sql: changeFilePredicateFiles(),
    parameters: [
      s.workspaceId,
      id,
      old.projectId,
      old.taskId,
      old.version,
      old.deletedAt,
      old.deletedBy,
    ],
  };
  const { root, gate } = rootGate(r, s, p, old.projectId, marker, now, [guard], p.version),
    eventId = generateId(),
    undo = operation === 'delete' ? { id: generateId(), kind: 'file.delete' as const } : null;
  const payload = undo
    ? encodeUndoPayload({
        kind: 'file.delete',
        targets: [
          {
            id,
            postVersion: row.version,
            projectId: old.projectId,
            taskId: old.taskId,
            parentPostVersion: p.version + 1,
            before: {
              archivedAt: null,
              deletedAt: old.deletedAt,
              deletedBy: old.deletedBy,
              updatedAt: instant(old.updatedAt),
            },
          },
        ],
        activityIds: [eventId],
      })
    : null;
  const statements = [
    root,
    operation === 'duplicate'
      ? changeFileInsertFiles(r, row, gate)
      : changeFilePrepareFiles(r, gate, row, now, marker, s, id),
    changeFileInsertActivity(r, eventId, s, old, operation, row, marker, now, gate),
  ];
  if (undo)
    statements.push(changeFilePrepareCommandUndoRecords(r, p, gate, undo, s, payload, id, now));
  statements.push(changeFilePrepareFilesResult(r, gate, s, copyId));
  changeFileBudget(r, statements);
  const unresolved = (cause?: unknown) =>
    report({
      phase: 'duplicate-unconfirmed',
      errorCode: 'INTERNAL_ERROR',
      fileId: copyId,
      sourceFileId: id,
      cause,
    });
  if (operation === 'duplicate' && old.storageMode === 'r2') {
    try {
      const content = await bucket.get(required(old.objectKey, 'Missing file invariant'));
      if (!content) throw new ApiFailure('NOT_FOUND', 'File content missing');
      const write = await bucket.put(
        required(row.objectKey, 'Missing file invariant'),
        content.body,
        {
          httpMetadata: { contentType: required(old.mimeType, 'Missing file invariant') },
          customMetadata: { contentSha256: required(old.contentSha256, 'Missing file invariant') },
        },
      );
      if (write.kind === 'unconfirmed-write') throw write.cause;
    } catch {
      unresolved();
      throw new ApiFailure(
        'INTERNAL_ERROR',
        'Duplicate bytes are unconfirmed; inspect the recorded copy intent',
      );
    }
  }
  const attempt: FileMutationAttempt =
    operation === 'duplicate' && row.storageMode === 'r2'
      ? {
          kind: 'owned-copy',
          id: copyId,
          objectKey: required(row.objectKey, 'Missing copy object key'),
        }
      : { kind: 'metadata' };
  const outcome = await fileMutationOutcome(r, s, statements, attempt);
  if (outcome.kind === 'confirmed-rollback') {
    await cleanup(bucket, row, report);
    throw outcome.cause;
  }
  if (outcome.kind === 'verified-copy') {
    await currentActor(r, s);
    const current = await fileRow(r, s, copyId);
    await available(bucket, current);
    return { file: fileDto(current), undo: null };
  }
  if (outcome.kind === 'unconfirmed-commit') {
    unresolved(outcome.cause);
    throw new ApiFailure(
      'INTERNAL_ERROR',
      'Duplicate outcome is unconfirmed; inspect the recorded copy intent',
    );
  }
  const results = outcome.results;
  if (results[0]?.meta.changes !== 1) {
    if (operation === 'duplicate' && row.storageMode === 'r2') await cleanup(bucket, row, report);
    throw new ApiFailure('CONFLICT', 'File or parent changed');
  }
  return { file: fileDto(row), undo };
}
