import { operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody as body, noInput as noQuery, parseRequest } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { readWorkspace, updateWorkspace } from './index.ts';
type C = Context<ApiEnvironment>;
const scope = (c: C) => c.get('workspace'),
  repo = (c: C) => c.get('repository');
export const workspaceRoutes = new Hono<ApiEnvironment>();
workspaceRoutes.get('/workspaces/:workspaceId', async (c) => {
  await noQuery(c);
  return c.json(
    operations.getWorkspace.response.parse({
      data: await readWorkspace(repo(c), scope(c).workspaceId),
    }),
  );
});
workspaceRoutes.patch('/workspaces/:workspaceId', async (c) => {
  const input = parseRequest(operations.updateWorkspace.request, {
    workspaceId: scope(c).workspaceId,
    body: await body(c),
  });
  return c.json(
    operations.updateWorkspace.response.parse({
      data: await updateWorkspace(
        repo(c),
        scope(c),
        c.get('currentMember'),
        input.body,
        serverClock.now(),
      ),
    }),
  );
});
