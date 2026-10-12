import type { RequestRepository } from '../../../db/client.ts';
import { required } from '../../../shared/errors.ts';
import type { FileIntentProjection } from './model.ts';
export async function commitUpload(
  repository: RequestRepository,
  statements: D1PreparedStatement[],
): Promise<FileIntentProjection | undefined> {
  return required(
    (await repository.batch<FileIntentProjection>(statements)).at(-1),
    'Missing upload intent result',
  ).results[0];
}
