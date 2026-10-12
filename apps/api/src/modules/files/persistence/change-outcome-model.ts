import type { FileRow } from './model.ts';
export type FileMutationAttempt =
  | { kind: 'metadata' }
  | { kind: 'owned-copy'; id: string; objectKey: string };
export type FileMutationOutcome =
  | { kind: 'confirmed-result'; results: D1Result<FileRow>[] }
  | { kind: 'verified-copy'; row: FileRow }
  | { kind: 'confirmed-rollback'; cause: unknown }
  | { kind: 'unconfirmed-commit'; cause: unknown };
