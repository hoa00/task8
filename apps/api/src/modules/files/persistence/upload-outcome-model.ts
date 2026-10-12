import type { FileIntentProjection } from './model.ts';
export type UploadOutcome =
  | { kind: 'confirmed-own-winner'; winner: FileIntentProjection; created: boolean }
  | { kind: 'confirmed-other-winner'; winner: FileIntentProjection }
  | { kind: 'confirmed-no-winner' }
  | { kind: 'confirmed-rollback'; cause: unknown }
  | { kind: 'unconfirmed-commit'; cause: unknown };
