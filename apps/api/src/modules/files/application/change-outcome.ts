import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { confirmedRollback } from '../../../db/outcome.ts';
import type {
  FileMutationAttempt,
  FileMutationOutcome,
} from '../persistence/change-outcome-model.ts';
import { commitFileChange, copyById } from '../persistence/change.ts';
import type { FileRow } from '../persistence/model.ts';

export async function fileMutationOutcome(
  repository: RequestRepository,
  scope: WorkspaceContext,
  statements: D1PreparedStatement[],
  attempt: FileMutationAttempt,
): Promise<FileMutationOutcome> {
  try {
    return { kind: 'confirmed-result', results: await commitFileChange(repository, statements) };
  } catch (cause) {
    if (attempt.kind === 'metadata') throw cause;
    if (confirmedRollback(cause)) return { kind: 'confirmed-rollback', cause };
    let verification:
      | { kind: 'confirmed-read'; row: FileRow | undefined }
      | { kind: 'unconfirmed-read'; cause: unknown };
    try {
      verification = { kind: 'confirmed-read', row: await copyById(repository, scope, attempt.id) };
    } catch (readCause) {
      verification = { kind: 'unconfirmed-read', cause: readCause };
    }
    if (verification.kind === 'confirmed-read' && verification.row?.objectKey === attempt.objectKey)
      return { kind: 'verified-copy', row: verification.row };
    return { kind: 'unconfirmed-commit', cause };
  }
}

export type { FileMutationAttempt } from '../persistence/change-outcome-model.ts';
