import {
  EntityIdSchema,
  TaskQuerySchema,
  TaskScopeQuerySchema,
  operations,
} from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  jsonBody as body,
  noInput as noQuery,
  parseRequest,
  readQuery as query,
} from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { ApiFailure } from '../../shared/errors.ts';
import {
  bulkTasks,
  completeTask,
  createTask,
  duplicateTask,
  favoriteTask,
  lifecycleTask,
  moveTask,
  queryTasks,
  resolveTaskKey,
  taskDetail,
  updateTask,
} from './index.ts';
type C = Context<ApiEnvironment>;
const s = (c: C) => c.get('workspace'),
  r = (c: C) => c.get('repository'),
  id = (c: C) => parseRequest(EntityIdSchema, c.req.param('taskId'));

export const taskRoutes = new Hono<ApiEnvironment>();
const W = '/workspaces/:workspaceId';
taskRoutes.get(W + '/tasks', async (c) =>
  c.json(
    operations.listTasks.response.parse({
      data: await queryTasks(
        r(c),
        s(c),
        parseRequest(TaskQuerySchema, await query(c)),
        serverClock.now(),
      ),
    }),
  ),
);
taskRoutes.get(W + '/tasks/summary', async (c) =>
  c.json(
    operations.getTaskSummary.response.parse({
      data: await queryTasks(
        r(c),
        s(c),
        parseRequest(TaskQuerySchema, parseRequest(TaskScopeQuerySchema, await query(c))),
        serverClock.now(),
        true,
      ),
    }),
  ),
);
taskRoutes.post(W + '/tasks/bulk', async (c) => {
  const raw = await body(c);
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'items' in raw &&
    Array.isArray(raw.items) &&
    raw.items.length > 20
  )
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Bulk exceeds maxBulkItems');
  const input = parseRequest(operations.bulkMutateTasks.request, {
    workspaceId: s(c).workspaceId,
    body: raw,
  });
  return c.json(
    operations.bulkMutateTasks.response.parse({
      data: await bulkTasks(r(c), s(c), input.body, serverClock.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks', async (c) => {
  const input = parseRequest(operations.createTask.request, {
      workspaceId: s(c).workspaceId,
      body: await body(c),
    }),
    result = await createTask(r(c), s(c), input.body, serverClock.now());
  return c.json(
    operations.createTask.response.parse({ data: result.result }),
    result.replayed ? 200 : 201,
  );
});
taskRoutes.get(W + '/task-keys/:taskKey', async (c) => {
  await noQuery(c);
  const input = parseRequest(operations.resolveTaskKey.request, {
      workspaceId: s(c).workspaceId,
      taskKey: c.req.param('taskKey'),
    }),
    detail = await resolveTaskKey(r(c), s(c), input.taskKey);
  return c.json(
    operations.resolveTaskKey.response.parse({
      data: detail,
    }),
  );
});
taskRoutes.get(W + '/tasks/:taskId', async (c) => {
  await noQuery(c);
  return c.json(operations.getTask.response.parse({ data: await taskDetail(r(c), s(c), id(c)) }));
});
taskRoutes.patch(W + '/tasks/:taskId', async (c) => {
  const input = parseRequest(operations.updateTask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.updateTask.response.parse({
      data: await updateTask(r(c), s(c), id(c), input.body, serverClock.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks/:taskId/completion', async (c) => {
  const input = parseRequest(operations.setTaskCompletion.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.setTaskCompletion.response.parse({
      data: await completeTask(r(c), s(c), id(c), input.body, serverClock.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks/:taskId/move', async (c) => {
  const input = parseRequest(operations.moveTask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.moveTask.response.parse({
      data: await moveTask(r(c), s(c), id(c), input.body, serverClock.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks/:taskId/duplicate', async (c) => {
  const input = parseRequest(operations.duplicateTask.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.duplicateTask.response.parse({
      data: await duplicateTask(r(c), s(c), id(c), input.body, serverClock.now()),
    }),
  );
});
for (const [suffix, op, method] of [
  ['archive', 'archiveTask', 'post'],
  ['restore', 'restoreTask', 'post'],
  ['delete', 'deleteTask', 'delete'],
  ['restore-deleted', 'restoreDeletedTask', 'post'],
] as const)
  taskRoutes[method](
    W + '/tasks/:taskId' + (suffix === 'delete' ? '' : '/' + suffix),
    async (c) => {
      const input = parseRequest(operations[op].request, {
        workspaceId: s(c).workspaceId,
        taskId: id(c),
        body: await body(c),
      });
      return c.json(
        operations[op].response.parse({
          data: await lifecycleTask(
            r(c),
            s(c),
            id(c),
            input.body.expectedVersion,
            suffix,
            serverClock.now(),
          ),
        }),
      );
    },
  );
for (const [method, op, favorite] of [
  ['put', 'addTaskFavorite', true],
  ['delete', 'removeTaskFavorite', false],
] as const)
  taskRoutes[method](W + '/me/task-favorites/:taskId', async (c) => {
    await noQuery(c);
    return c.json(
      operations[op].response.parse({
        data: await favoriteTask(r(c), s(c), id(c), favorite, serverClock.now()),
      }),
    );
  });
