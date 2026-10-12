import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql as accessSql } from '../../projects/access.ts';
import type { TaskProjection } from './model.ts';
import { taskSelect } from './reads.ts';
export async function datasetRows(r: RequestRepository, s: WorkspaceContext) {
  return r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.deletedAt IS NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}`,
    [s.memberId, s.memberId, s.workspaceId, s.memberId],
  );
}
export async function datasetProjects(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ id: EntityId; name: string; color: string }>(
    `SELECT p.id,p.name,p.color FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,
    [s.workspaceId, s.memberId],
  );
}
