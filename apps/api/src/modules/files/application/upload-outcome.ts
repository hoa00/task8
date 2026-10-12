import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { confirmedRollback } from '../../../db/outcome.ts';
import type { FileIntentProjection, FileRow } from '../persistence/model.ts';
import { intent } from '../persistence/reads.ts';
import type { UploadOutcome } from '../persistence/upload-outcome-model.ts';
import { commitUpload } from '../persistence/upload.ts';

export async function uploadOutcome(
  repository: RequestRepository,
  scope: WorkspaceContext,
  statements: D1PreparedStatement[],
  attempt: FileRow,
  requestId: string,
): Promise<UploadOutcome> {
  try {
    const winner = await commitUpload(repository, statements);
    if (!winner) return { kind: 'confirmed-no-winner' };
    return winner.objectKey === attempt.objectKey
      ? { kind: 'confirmed-own-winner', winner, created: true }
      : { kind: 'confirmed-other-winner', winner };
  } catch (cause) {
    let verification:
      | { kind: 'confirmed-read'; winner: FileIntentProjection | undefined }
      | { kind: 'unconfirmed-read'; cause: unknown };
    try {
      verification = { kind: 'confirmed-read', winner: await intent(repository, scope, requestId) };
    } catch (readCause) {
      verification = { kind: 'unconfirmed-read', cause: readCause };
    }
    if (verification.kind === 'confirmed-read' && verification.winner) {
      const winner = verification.winner;
      return winner.objectKey === attempt.objectKey
        ? { kind: 'confirmed-own-winner', winner, created: false }
        : { kind: 'confirmed-other-winner', winner };
    }
    if (confirmedRollback(cause)) return { kind: 'confirmed-rollback', cause };
    return { kind: 'unconfirmed-commit', cause };
  }
}
