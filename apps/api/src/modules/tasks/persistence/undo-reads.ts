import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { writeAccessSql } from '../../projects/access.ts';
import type { TaskProjection } from './model.ts';
import { taskSelect } from './reads.ts';
export async function undoTaskRows(
  r: RequestRepository,
  s: WorkspaceContext,
  ids: readonly string[],
) {
  return r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.id IN (SELECT value FROM json_each(?))`,
    [s.memberId, s.memberId, s.workspaceId, JSON.stringify(ids)],
  );
}
export async function undoProjectRows(
  r: RequestRepository,
  s: WorkspaceContext,
  ids: readonly string[],
) {
  return r.all<{
    id: string;
    allowed: number;
    archivedAt: number | null;
    deletedAt: number | null;
  }>(
    `SELECT p.id,p.archivedAt,p.deletedAt,${writeAccessSql} allowed FROM projects p WHERE p.workspaceId=? AND p.id IN (SELECT value FROM json_each(?))`,
    [s.memberId, s.workspaceId, JSON.stringify(ids)],
  );
}
