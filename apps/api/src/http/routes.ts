import { CatalogsSchema, catalogs, operations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { workspaceMiddleware } from '../middleware.ts';
import { readBootstrap } from '../modules/projections/index.ts';
import { listWorkspaces } from '../modules/workspaces/index.ts';
import type { ApiEnvironment } from '../runtime.ts';
import { serverClock } from '../shared/clock.ts';
import { features } from './features.ts';
import { noInput as noQuery } from './request.ts';
export { apiCapabilities as capabilities } from '../shared/capabilities.ts';
import { apiCapabilities as capabilities } from '../shared/capabilities.ts';
export const routes = new Hono<ApiEnvironment>();
for (const path of [
  '/session',
  '/workspaces',
  '/workspaces/:workspaceId/bootstrap',
  '/workspaces/:workspaceId/catalogs',
])
  routes.use(path, async (c, next) => {
    if (c.req.method === 'GET') await noQuery(c);
    await next();
  });
routes.get('/session', (c) => {
  const principal = c.get('principal');
  const advertised = principal.authSession
    ? {
        ...capabilities,
        identityMode: 'ict24h',
        features: { ...capabilities.features, authentication: 'implemented' },
      }
    : capabilities;
  c.header('cache-control', 'no-store');
  return c.json(
    operations.getSession.response.parse({ data: { ...principal, capabilities: advertised } }),
  );
});
routes.get('/workspaces', async (c) => {
  return c.json(
    operations.listWorkspaces.response.parse({
      data: await listWorkspaces(c.get('repository'), c.get('principal').user.id),
    }),
  );
});
routes.use('/workspaces/:workspaceId/*', workspaceMiddleware);
routes.use('/workspaces/:workspaceId', workspaceMiddleware);
routes.get('/workspaces/:workspaceId/bootstrap', async (c) =>
  c.json(
    operations.getBootstrap.response.parse({
      data: await readBootstrap(
        c.get('repository'),
        c.get('workspace'),
        c.get('currentMember'),
        serverClock.now(),
      ),
    }),
  ),
);
routes.get('/workspaces/:workspaceId/catalogs', (c) =>
  c.json({ data: CatalogsSchema.parse(catalogs) }),
);
routes.route('/', features);
