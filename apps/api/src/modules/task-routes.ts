import { Hono } from 'hono';
import {
  EntityIdSchema,
  TaskQuerySchema,
  TaskScopeQuerySchema,
  operations,
} from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { queryTasks, taskDetail } from './task-read.ts';
import {
  bulkTasks,
  completeTask,
  createTask,
  duplicateTask,
  favoriteTask,
  lifecycleTask,
  moveTask,
  updateTask,
} from './tasks.ts';
import type { ApiEnvironment } from '../runtime.ts';
import type { Context } from 'hono';
type C = Context<ApiEnvironment>;
const s = (c: C) => c.get('workspace'),
  r = (c: C) => c.get('repository'),
  id = (c: C) => EntityIdSchema.parse(c.req.param('taskId'));
async function body(c: C) {
  if (
    Object.keys(c.req.query()).length ||
    !c.req.header('content-type')?.startsWith('application/json')
  )
    throw new ApiFailure('VALIDATION_ERROR', 'JSON body required without query fields');
  try {
    return await c.req.json();
  } catch {
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid JSON');
  }
}
function query(c: C) {
  if (Number(c.req.header('content-length') ?? 0) > 0 || c.req.header('transfer-encoding'))
    throw new ApiFailure('VALIDATION_ERROR', 'Read does not accept body');
  const out: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(c.req.queries())) {
    if (values.length !== 1) throw new ApiFailure('VALIDATION_ERROR', 'Repeated query field');
    let value: unknown = values[0];
    if (['archived', 'favoriteOnly'].includes(key)) {
      if (value !== 'true' && value !== 'false')
        throw new ApiFailure('VALIDATION_ERROR', 'Invalid boolean');
      value = value === 'true';
    } else if (key === 'limit') {
      if (!/^\d+$/.test(String(value))) throw new ApiFailure('VALIDATION_ERROR', 'Invalid limit');
      value = Number(value);
    } else if (key === 'filters') {
      try {
        value = JSON.parse(String(value));
      } catch {
        throw new ApiFailure('VALIDATION_ERROR', 'Invalid filters');
      }
    } else if (key === 'assigneeId' && value === 'null') value = null;
    out[key] = value;
  }
  return out;
}
function noQuery(c: C) {
  if (Object.keys(query(c)).length)
    throw new ApiFailure('VALIDATION_ERROR', 'Query fields not accepted');
}
export const taskRoutes = new Hono<ApiEnvironment>();
const W = '/workspaces/:workspaceId';
taskRoutes.get(W + '/tasks', async (c) =>
  c.json(
    operations.listTasks.response.parse({
      data: await queryTasks(r(c), s(c), TaskQuerySchema.parse(query(c)), Date.now()),
    }),
  ),
);
taskRoutes.get(W + '/tasks/summary', async (c) =>
  c.json(
    operations.getTaskSummary.response.parse({
      data: await queryTasks(
        r(c),
        s(c),
        TaskQuerySchema.parse(TaskScopeQuerySchema.parse(query(c))),
        Date.now(),
        true,
      ),
    }),
  ),
);
taskRoutes.post(W + '/tasks/bulk', async (c) => {
  const raw = await body(c);
  if (Array.isArray(raw?.items) && raw.items.length > 20)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Bulk exceeds maxBulkItems');
  const input = operations.bulkMutateTasks.request.parse({
    workspaceId: s(c).workspaceId,
    body: raw,
  });
  return c.json(
    operations.bulkMutateTasks.response.parse({
      data: await bulkTasks(r(c), s(c), input.body, Date.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks', async (c) => {
  const input = operations.createTask.request.parse({
      workspaceId: s(c).workspaceId,
      body: await body(c),
    }),
    result = await createTask(r(c), s(c), input.body, Date.now());
  return c.json(
    operations.createTask.response.parse({ data: result.result }),
    result.replayed ? 200 : 201,
  );
});
taskRoutes.get(W + '/task-keys/:taskKey', async (c) => {
  noQuery(c);
  const input = operations.resolveTaskKey.request.parse({
      workspaceId: s(c).workspaceId,
      taskKey: c.req.param('taskKey'),
    }),
    rows = await r(c).all<{ id: string }>(
      "SELECT t.id FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND p.key||'-'||t.number=?",
      [s(c).workspaceId, input.taskKey],
    );
  if (!rows[0]) throw new ApiFailure('NOT_FOUND', 'Task not found');
  return c.json(
    operations.resolveTaskKey.response.parse({
      data: await taskDetail(r(c), s(c), EntityIdSchema.parse(rows[0].id)),
    }),
  );
});
taskRoutes.get(W + '/tasks/:taskId', async (c) => {
  noQuery(c);
  return c.json(operations.getTask.response.parse({ data: await taskDetail(r(c), s(c), id(c)) }));
});
taskRoutes.patch(W + '/tasks/:taskId', async (c) => {
  const input = operations.updateTask.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.updateTask.response.parse({
      data: await updateTask(r(c), s(c), id(c), input.body, Date.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks/:taskId/completion', async (c) => {
  const input = operations.setTaskCompletion.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.setTaskCompletion.response.parse({
      data: await completeTask(r(c), s(c), id(c), input.body, Date.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks/:taskId/move', async (c) => {
  const input = operations.moveTask.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.moveTask.response.parse({
      data: await moveTask(r(c), s(c), id(c), input.body, Date.now()),
    }),
  );
});
taskRoutes.post(W + '/tasks/:taskId/duplicate', async (c) => {
  const input = operations.duplicateTask.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c),
    body: await body(c),
  });
  return c.json(
    operations.duplicateTask.response.parse({
      data: await duplicateTask(r(c), s(c), id(c), input.body, Date.now()),
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
      const input = operations[op].request.parse({
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
            Date.now(),
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
    noQuery(c);
    return c.json(
      operations[op].response.parse({
        data: await favoriteTask(r(c), s(c), id(c), favorite, Date.now()),
      }),
    );
  });
