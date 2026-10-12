import { EntityIdSchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody as body, noInput as empty, parseRequest } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import {
  changeSavedView,
  createSavedView,
  favoriteProject,
  listSavedViews,
  projectOrder,
} from './index.ts';
type C = Context<ApiEnvironment>;
const s = (c: C) => c.get('workspace'),
  r = (c: C) => c.get('repository'),
  id = (c: C, key: string) => parseRequest(EntityIdSchema, c.req.param(key)),
  W = '/workspaces/:workspaceId';
export const personalProjectRoutes = new Hono<ApiEnvironment>();
personalProjectRoutes.get(W + '/projects/:projectId/views', async (c) => {
  await empty(c);
  return c.json(
    operations.listSavedViews.response.parse({
      data: await listSavedViews(r(c), s(c), id(c, 'projectId')),
    }),
  );
});
personalProjectRoutes.post(W + '/projects/:projectId/views', async (c) => {
  const input = parseRequest(operations.createSavedView.request, {
    workspaceId: s(c).workspaceId,
    projectId: id(c, 'projectId'),
    body: await body(c),
  });
  return c.json(
    operations.createSavedView.response.parse({
      data: await createSavedView(r(c), s(c), input.projectId, input.body, serverClock.now()),
    }),
    201,
  );
});
for (const [method, op, remove] of [
  ['patch', 'updateSavedView', false],
  ['delete', 'deleteSavedView', true],
] as const)
  personalProjectRoutes[method](W + '/views/:viewId', async (c) => {
    const input = parseRequest(operations[op].request, {
      workspaceId: s(c).workspaceId,
      viewId: id(c, 'viewId'),
      body: await body(c),
    });
    return c.json(
      operations[op].response.parse({
        data: await changeSavedView(
          r(c),
          s(c),
          input.viewId,
          remove ? { kind: 'delete', input: input.body } : { kind: 'update', input: input.body },
          serverClock.now(),
        ),
      }),
    );
  });
for (const [method, op, add] of [
  ['put', 'addProjectFavorite', true],
  ['delete', 'removeProjectFavorite', false],
] as const)
  personalProjectRoutes[method](W + '/me/project-favorites/:projectId', async (c) => {
    await empty(c);
    return c.json(
      operations[op].response.parse({
        data: await favoriteProject(r(c), s(c), id(c, 'projectId'), add, serverClock.now()),
      }),
    );
  });
personalProjectRoutes.put(W + '/me/project-order', async (c) => {
  const input = parseRequest(operations.updateProjectOrder.request, {
    workspaceId: s(c).workspaceId,
    body: await body(c),
  });
  return c.json(
    operations.updateProjectOrder.response.parse({
      data: await projectOrder(r(c), s(c), input.body.projectIds),
    }),
  );
});
