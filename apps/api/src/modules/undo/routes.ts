import { EntityIdSchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody as body, parseRequest } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { undoFile } from '../files/index.ts';
import { undoCommand } from './index.ts';
type C = Context<ApiEnvironment>;
const scope = (c: C) => c.get('workspace'),
  repo = (c: C) => c.get('repository');
export const undoRoutes = new Hono<ApiEnvironment>();
undoRoutes.post('/workspaces/:workspaceId/undo/:undoId', async (c) => {
  const input = parseRequest(operations.undoCommand.request, {
    workspaceId: scope(c).workspaceId,
    undoId: parseRequest(EntityIdSchema, c.req.param('undoId')),
    body: await body(c),
  });
  return c.json(
    operations.undoCommand.response.parse({
      data: await undoCommand(
        repo(c),
        scope(c),
        c.get('currentMember'),
        input.undoId,
        serverClock.now(),
        (repository, scope, record, now) =>
          undoFile(repository, scope, record, now, c.get('fileStorage')),
      ),
    }),
  );
});
