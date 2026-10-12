import type { TaskMutationDto } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { normalizeTaskDescription } from '../domain/description.ts';
import {
  allocation,
  baseTask,
  depRows,
  empty,
  event,
  execute,
  labelRows,
  replay,
} from './planning.ts';
import { requireResultTask } from './result.ts';

import type { CreateTaskInput } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';

export async function createTask(
  r: RequestRepository,
  s: WorkspaceContext,
  body: CreateTaskInput,
  now: number,
  ids: IdGenerator = newId,
): Promise<{ result: TaskMutationDto; replayed: boolean }> {
  const description = normalizeTaskDescription(body.descriptionHtml),
    { clientRequestId, ...intent } = body;
  const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify({
          ...intent,
          descriptionHtml: description.html,
          labelIds: [...body.labelIds].sort(),
          dependencyIds: [...body.dependencyIds].sort(),
        }),
      ),
    ),
    hash = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const prior = await replay(r, s, clientRequestId, hash, body.projectId);
  if (prior) return { result: prior, replayed: true };
  const plan = empty(ids),
    task = baseTask(s, body, now, ids);
  task.number = allocation(plan, task.projectId);
  task.createRequestHash = hash;
  plan.created = [task];
  plan.children = body.subtasks.map((c, i) => ({
    id: ids(),
    workspaceId: s.workspaceId,
    taskId: task.id,
    title: c.title,
    done: c.done,
    assigneeId: c.assigneeId,
    dueDate: c.dueDate,
    note: c.note,
    position: i * 100,
    createdAt: now,
    updatedAt: now,
  }));
  plan.labels = labelRows(s, task.id, body.labelIds);
  plan.dependencies = depRows(s, task.id, body.dependencyIds);
  plan.events = [event(s, task, now, 'task.created', ids)];
  plan.intent = { kind: 'create', request: { id: clientRequestId, hash } };
  const result = await execute(r, s, plan, now);
  if (!result) {
    const current = await replay(r, s, clientRequestId, hash, body.projectId);
    if (current) return { result: current, replayed: true };
    throw new ApiFailure('CONFLICT', 'Task create scope changed');
  }
  return {
    result: {
      task: requireResultTask(result.createdTasks[0]),
      createdTasks: [],
      affectedProjectIds: result.affectedProjectIds,
      undo: null,
    },
    replayed: false,
  };
}
