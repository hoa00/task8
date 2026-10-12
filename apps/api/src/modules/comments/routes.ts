import { CursorQuerySchema, EntityIdSchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  jsonBody as body,
  noInput as empty,
  parseRequest,
  readQuery as query,
} from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { createComment, lifecycleComment, listComments, reactComment } from './index.ts';
type C = Context<ApiEnvironment>;
const r = (c: C) => c.get('repository'),
  s = (c: C) => c.get('workspace'),
  id = (c: C, key: string) => parseRequest(EntityIdSchema, c.req.param(key));
const W = '/workspaces/:workspaceId';
export const commentRoutes = new Hono<ApiEnvironment>();
commentRoutes.get(W + '/tasks/:taskId/comments', async (c) => {
  const input = parseRequest(operations.listComments.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    query: parseRequest(CursorQuerySchema, await query(c)),
  });
  return c.json(
    operations.listComments.response.parse({
      data: await listComments(r(c), s(c), input.taskId, input.query),
    }),
  );
});
commentRoutes.post(W + '/tasks/:taskId/comments', async (c) => {
  const input = parseRequest(operations.createComment.request, {
    workspaceId: s(c).workspaceId,
    taskId: id(c, 'taskId'),
    body: await body(c),
  });
  return c.json(
    operations.createComment.response.parse({
      data: await createComment(r(c), s(c), input.taskId, input.body, serverClock.now()),
    }),
    201,
  );
});
for (const [method, op, restore] of [
  ['delete', 'deleteComment', false],
  ['post', 'restoreDeletedComment', true],
] as const)
  commentRoutes[method](
    W + '/comments/:commentId' + (restore ? '/restore-deleted' : ''),
    async (c) => {
      const input = parseRequest(operations[op].request, {
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
            serverClock.now(),
          ),
        }),
      );
    },
  );
for (const [method, op, add] of [
  ['put', 'addCommentReaction', true],
  ['delete', 'removeCommentReaction', false],
] as const)
  commentRoutes[method](W + '/comments/:commentId/reactions/:reactionKey', async (c) => {
    await empty(c);
    const input = parseRequest(operations[op].request, {
      workspaceId: s(c).workspaceId,
      commentId: id(c, 'commentId'),
      reactionKey: c.req.param('reactionKey'),
    });
    return c.json(
      operations[op].response.parse({
        data: await reactComment(
          r(c),
          s(c),
          input.commentId,
          input.reactionKey,
          add,
          serverClock.now(),
        ),
      }),
    );
  });
