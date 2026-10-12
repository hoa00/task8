import { ActivityQuerySchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { parseRequest, readQuery as query } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { listActivity } from './index.ts';
type C = Context<ApiEnvironment>;
const r = (c: C) => c.get('repository'),
  s = (c: C) => c.get('workspace');
const W = '/workspaces/:workspaceId';
export const activityRoutes = new Hono<ApiEnvironment>();
activityRoutes.get(W + '/activity', async (c) => {
  const input = parseRequest(operations.listActivity.request, {
    workspaceId: s(c).workspaceId,
    query: parseRequest(ActivityQuerySchema, await query(c)),
  });
  return c.json(
    operations.listActivity.response.parse({ data: await listActivity(r(c), s(c), input.query) }),
  );
});
