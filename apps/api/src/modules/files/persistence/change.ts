import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { FileRow } from './model.ts';
export function commitFileChange(
  repository: RequestRepository,
  statements: D1PreparedStatement[],
): Promise<D1Result<FileRow>[]> {
  return repository.batch<FileRow>(statements);
}
export async function copyById(
  repository: RequestRepository,
  scope: WorkspaceContext,
  id: string,
): Promise<FileRow | undefined> {
  return (
    await repository.all<FileRow>('SELECT * FROM files WHERE workspaceId=? AND id=?', [
      scope.workspaceId,
      id,
    ])
  )[0];
}
