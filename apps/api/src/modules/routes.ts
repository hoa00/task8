import { CapabilitiesSchema, CatalogsSchema, catalogs, operations } from '@studio/contracts/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { workspaceMembers, workspaces } from '../db/schema.ts';
import { noInput as noQuery } from '../http/request.ts';
import { workspaceMiddleware } from '../middleware.ts';
import type { ApiEnvironment } from '../runtime.ts';
import { apiLimits } from '../shared/limits.ts';
import { readBootstrap, workspaceDto } from './bootstrap.ts';
import { features } from './features.ts';
export const capabilities = CapabilitiesSchema.parse({
  dataMode: 'http',
  identityMode: 'development',
  features: {
    projects: 'implemented',
    tasks: 'implemented',
    teams: 'implemented',
    comments: 'implemented',
    notificationState: 'implemented',
    fileMetadata: 'implemented',
    fileBytes: 'implemented',
    workspaceProvisioning: 'unavailable',
    invitations: 'unavailable',
    projectSharing: 'unavailable',
    authentication: 'unavailable',
    accountSecurity: 'unavailable',
    billing: 'unavailable',
  },
  limits: apiLimits,
});
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
routes.get('/session', (c) =>
  c.json(operations.getSession.response.parse({ data: { ...c.get('principal'), capabilities } })),
);
routes.get('/workspaces', async (c) => {
  const r = c.get('repository');
  const rows = await r.read((db) =>
    db
      .select({ workspace: workspaces })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.userId, c.get('principal').user.id),
          eq(workspaceMembers.status, 'active'),
          isNull(workspaceMembers.removedAt),
        ),
      )
      .orderBy(asc(workspaces.id)),
  );
  return c.json(
    operations.listWorkspaces.response.parse({
      data: rows.map((row) => workspaceDto(row.workspace)),
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
        Date.now(),
      ),
    }),
  ),
);
routes.get('/workspaces/:workspaceId/catalogs', (c) =>
  c.json({ data: CatalogsSchema.parse(catalogs) }),
);
routes.route('/', features);
