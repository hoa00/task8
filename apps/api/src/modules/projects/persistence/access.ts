import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { projects } from '../../../db/schema.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { ProjectLifecycle } from './policy.ts';
import { readAccessSql as accessSql, projectLifecycleSql, writeAccessSql } from './policy.ts';
type ProjectRow = Omit<typeof projects.$inferSelect, 'readKeys'>;
export async function projectRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  mode: {
    visibility: 'detail' | 'child';
    lifecycle: ProjectLifecycle;
    access: 'read' | 'write';
  } = { visibility: 'detail', lifecycle: 'detail', access: 'read' },
) {
  const [row] = await r.all<ProjectRow & { allowed: number }>(
    `SELECT p.*,${mode.access === 'write' ? writeAccessSql : accessSql} allowed FROM projects p WHERE p.workspaceId=? AND p.id=?${projectLifecycleSql(mode.lifecycle)}`,
    [s.memberId, s.workspaceId, id],
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Project not found');
  if (!row.allowed)
    throw new ApiFailure(
      mode.visibility === 'child' ? 'NOT_FOUND' : 'FORBIDDEN',
      'Project is restricted',
    );
  return row;
}
