import type { $brand } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { FileRow } from './model.ts';

export function listFilesReadFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string & $brand<'EntityId'>,
) {
  return r.all<FileRow>(
    `SELECT f.* FROM files f WHERE f.workspaceId=? AND f.projectId=? AND f.deletedAt IS NULL AND (f.taskId IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.workspaceId=f.workspaceId AND t.id=f.taskId AND t.projectId=f.projectId AND t.deletedAt IS NULL AND t.archivedAt IS NULL))`,
    [s.workspaceId, id],
  );
}
