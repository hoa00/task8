import { EntityIdSchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody as body, parseRequest } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { mutateSubtask } from './index.ts';
type C = Context<ApiEnvironment>;
const r = (c: C) => c.get('repository'),
  s = (c: C) => c.get('workspace'),
  id = (c: C, key: string) => parseRequest(EntityIdSchema, c.req.param(key));
const W = '/workspaces/:workspaceId';
export const subtaskRoutes = new Hono<ApiEnvironment>();
subtaskRoutes.post(W + '/tasks/:taskId/subtasks', async (c) => {
  const input = parseRequest(operations.createSubtask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    body: await body(c),
  });
  return c.json(
    operations.createSubtask.response.parse({
      data: await mutateSubtask(
        r(c),
        s(c),
        input.taskId,
        { operation: 'create', input: input.body },
        serverClock.now(),
      ),
    }),
    201,
  );
});
subtaskRoutes.patch(W + '/tasks/:taskId/subtasks/:subtaskId', async (c) => {
  const input = parseRequest(operations.updateSubtask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    subtaskId: id(c, 'subtaskId'),
    body: await body(c),
  });
  return c.json(
    operations.updateSubtask.response.parse({
      data: await mutateSubtask(
        r(c),
        s(c),
        input.taskId,
        { operation: 'update', input: input.body, childId: input.subtaskId },
        serverClock.now(),
      ),
    }),
  );
});
subtaskRoutes.delete(W + '/tasks/:taskId/subtasks/:subtaskId', async (c) => {
  const input = parseRequest(operations.deleteSubtask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    subtaskId: id(c, 'subtaskId'),
    body: await body(c),
  });
  return c.json(
    operations.deleteSubtask.response.parse({
      data: await mutateSubtask(
        r(c),
        s(c),
        input.taskId,
        { operation: 'delete', input: input.body, childId: input.subtaskId },
        serverClock.now(),
      ),
    }),
  );
});
subtaskRoutes.post(W + '/tasks/:taskId/subtasks/:subtaskId/promote', async (c) => {
  const input = parseRequest(operations.promoteSubtask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    subtaskId: id(c, 'subtaskId'),
    body: await body(c),
  });
  return c.json(
    operations.promoteSubtask.response.parse({
      data: await mutateSubtask(
        r(c),
        s(c),
        input.taskId,
        { operation: 'promote', input: input.body, childId: input.subtaskId },
        serverClock.now(),
      ),
    }),
  );
});
