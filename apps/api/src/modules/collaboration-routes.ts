import { Hono } from 'hono';
import {
  ActivityQuerySchema,
  CursorQuerySchema,
  EntityIdSchema,
  operations,
} from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { mutateSubtask } from './task-children.ts';
import { createComment, lifecycleComment, listComments, reactComment } from './comments.ts';
import { listActivity } from './activity.ts';
import type { Context } from 'hono';
import type { ApiEnvironment } from '../runtime.ts';
type C = Context<ApiEnvironment>;
const r = (c: C) => c.get('repository'),
  s = (c: C) => c.get('workspace'),
  id = (c: C, key: string) => EntityIdSchema.parse(c.req.param(key));
function query(c: C) {
  if (
    c.req.method === 'GET' &&
    (Number(c.req.header('content-length') ?? 0) > 0 || c.req.header('transfer-encoding'))
  )
    throw new ApiFailure('VALIDATION_ERROR', 'Read does not accept a body');
  const values: Record<string, unknown> = {};
  for (const [key, rows] of Object.entries(c.req.queries())) {
    if (rows.length !== 1) throw new ApiFailure('VALIDATION_ERROR', 'Repeated query field');
    if (key === 'limit') {
      if (!/^\d+$/.test(rows[0]!)) throw new ApiFailure('VALIDATION_ERROR', 'Invalid limit');
      values[key] = Number(rows[0]);
    } else values[key] = rows[0];
  }
  return values;
}
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
function empty(c: C) {
  if (
    Object.keys(query(c)).length ||
    Number(c.req.header('content-length') ?? 0) > 0 ||
    c.req.header('transfer-encoding')
  )
    throw new ApiFailure('VALIDATION_ERROR', 'Operation does not accept input');
}
export const collaborationRoutes = new Hono<ApiEnvironment>();
const W = '/workspaces/:workspaceId';
collaborationRoutes.post(W + '/tasks/:taskId/subtasks', async (c) => {
  const input = operations.createSubtask.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    body: await body(c),
  });
  return c.json(
    operations.createSubtask.response.parse({
      data: await mutateSubtask(r(c), s(c), input.taskId, input.body, Date.now(), 'create'),
    }),
    201,
  );
});
collaborationRoutes.patch(W + '/tasks/:taskId/subtasks/:subtaskId', async (c) => {
  const input = operations.updateSubtask.request.parse({
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
        input.body,
        Date.now(),
        'update',
        input.subtaskId,
      ),
    }),
  );
});
collaborationRoutes.delete(W + '/tasks/:taskId/subtasks/:subtaskId', async (c) => {
  const input = operations.deleteSubtask.request.parse({
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
        input.body,
        Date.now(),
        'delete',
        input.subtaskId,
      ),
    }),
  );
});
collaborationRoutes.post(W + '/tasks/:taskId/subtasks/:subtaskId/promote', async (c) => {
  const input = operations.promoteSubtask.request.parse({
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
        input.body,
        Date.now(),
        'promote',
        input.subtaskId,
      ),
    }),
  );
});
collaborationRoutes.get(W + '/tasks/:taskId/comments', async (c) => {
  const input = operations.listComments.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    query: CursorQuerySchema.parse(query(c)),
  });
  return c.json(
    operations.listComments.response.parse({
      data: await listComments(r(c), s(c), input.taskId, input.query),
    }),
  );
});
collaborationRoutes.post(W + '/tasks/:taskId/comments', async (c) => {
  const input = operations.createComment.request.parse({
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    body: await body(c),
  });
  return c.json(
    operations.createComment.response.parse({
      data: await createComment(r(c), s(c), input.taskId, input.body, Date.now()),
    }),
    201,
  );
});
for (const [method, op, restore] of [
  ['delete', 'deleteComment', false],
  ['post', 'restoreDeletedComment', true],
] as const)
  collaborationRoutes[method](
    W + '/comments/:commentId' + (restore ? '/restore-deleted' : ''),
    async (c) => {
      const input = operations[op].request.parse({
        workspaceId: s(c).workspaceId,
        commentId: id(c, 'commentId'),
        body: await body(c),
      });
      return c.json(
        operations[op].response.parse({
          data: await lifecycleComment(
            r(c),
            s(c),
            input.commentId,
            input.body.expectedVersion,
            restore,
            Date.now(),
          ),
        }),
      );
    },
  );
for (const [method, op, add] of [
  ['put', 'addCommentReaction', true],
  ['delete', 'removeCommentReaction', false],
] as const)
  collaborationRoutes[method](W + '/comments/:commentId/reactions/:reactionKey', async (c) => {
    empty(c);
    const input = operations[op].request.parse({
      workspaceId: s(c).workspaceId,
      commentId: id(c, 'commentId'),
      reactionKey: c.req.param('reactionKey'),
    });
    return c.json(
      operations[op].response.parse({
        data: await reactComment(r(c), s(c), input.commentId, input.reactionKey, add, Date.now()),
      }),
    );
  });
collaborationRoutes.get(W + '/activity', async (c) => {
  const input = operations.listActivity.request.parse({
    workspaceId: s(c).workspaceId,
    query: ActivityQuerySchema.parse(query(c)),
  });
  return c.json(
    operations.listActivity.response.parse({ data: await listActivity(r(c), s(c), input.query) }),
  );
});
