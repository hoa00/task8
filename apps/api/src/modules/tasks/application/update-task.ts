import type { EntityId, TaskMutationDto, UpdateTaskInput } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { applyTaskUpdate } from './apply-task-update.ts';
export async function updateTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: UpdateTaskInput,
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskMutationDto> {
  return applyTaskUpdate(r, s, id, { kind: 'patch', input: body }, now, ids);
}
