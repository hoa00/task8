import type { EntityId } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { projectRow } from '../../projects/access.ts';
import { taskRow } from '../persistence/reads.ts';

export async function writableTask(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  const task = await taskRow(r, s, id);
  if (task.archivedAt !== null) throw new ApiFailure('CONFLICT', 'Restore task before editing');
  await projectRow(r, s, EntityIdSchema.parse(task.projectId), {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'write',
  });
  return task;
}
