import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { FileStorage } from '../../../storage/r2.ts';
import { fileRow } from '../persistence/reads.ts';
export async function fileContent(
  repository: RequestRepository,
  scope: WorkspaceContext,
  storage: FileStorage,
  id: EntityId,
) {
  const file = await fileRow(repository, scope, id);
  if (file.storageMode !== 'r2' || !file.objectKey)
    throw new ApiFailure('NOT_FOUND', 'Sample file has no original bytes');
  const object = await storage.get(file.objectKey);
  if (!object) throw new ApiFailure('NOT_FOUND', 'File bytes not found');
  return { file, object };
}
