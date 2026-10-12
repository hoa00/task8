import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { projectRow } from '../../projects/access.ts';
import { parentReadTasks } from '../persistence/parent.ts';
export async function parent(
  r: RequestRepository,
  s: WorkspaceContext,
  projectId: string,
  taskId: string | null,
  mode: 'read' | 'write' = 'write',
) {
  const p = await projectRow(r, s, EntityIdSchema.parse(projectId), {
    visibility: 'child',
    lifecycle: 'detail',
    access: mode,
  });
  if (p.archivedAt !== null) throw new ApiFailure('CONFLICT', 'Restore project first');
  if (taskId === null) return { table: 'projects' as const, id: p.id, version: p.version };
  const [t] = await parentReadTasks(r, s, taskId, projectId);
  if (!t) throw new ApiFailure('NOT_FOUND', 'Attachment task not found');
  return { table: 'tasks' as const, ...t };
}
