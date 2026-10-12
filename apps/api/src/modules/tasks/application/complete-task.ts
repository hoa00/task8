import type { TaskMutationDto } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { decideCompletion } from '../domain/completion.ts';
import { completionProjection } from '../mapper.ts';
import { taskRow } from '../persistence/reads.ts';
import { applyTaskUpdate } from './apply-task-update.ts';

import type { EntityId, SetTaskCompletionInput } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export async function completeTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: SetTaskCompletionInput,
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskMutationDto> {
  const old = await taskRow(r, s, id);
  return applyTaskUpdate(
    r,
    s,
    id,
    {
      kind: 'completion',
      input: body,
      status: decideCompletion(completionProjection(old), body.completed).status,
    },
    now,
    ids,
  );
}
