import { EntityIdSchema, authOperations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { jsonBody, noInput, parseRequest } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { ApiFailure } from '../../shared/errors.ts';
import type { AuthSessionService } from './index.ts';
import {
  authSettings,
  requireOrigin,
  requestSid,
  requireCookieCsrf,
  preauthCookieName,
  sessionCookie,
  type AuthSettings,
} from './http/index.ts';

type RequestRepository = ApiEnvironment['Variables']['repository'];
export type AuthServiceFactory = (
  env: ApiEnvironment['Bindings'],
  repository: RequestRepository,
  settings: AuthSettings,
) => AuthSessionService;
export function createAuthRoutes(
  factory: AuthServiceFactory,
  createRepository: (env: ApiEnvironment['Bindings']) => RequestRepository,
) {
  const routes = new Hono<ApiEnvironment>();
  routes.use('*', async (context, next) => {
    if (context.env.AUTH_MODE !== 'ict24h')
      throw new ApiFailure('CAPABILITY_UNAVAILABLE', 'Authentication is not available');
    const settings = authSettings(context.env);
    requireOrigin(context.req.raw, settings);
    await requireCookieCsrf(
      context.req.raw,
      requestSid(context.req.raw, settings)
        ? settings.cookieName
        : preauthCookieName(settings.secureCookie),
    );
    context.set('repository', createRepository(context.env));
    await next();
  });
  routes.post('/login', async (context) => {
    const settings = authSettings(context.env);
    const input = parseRequest(authOperations.authLogin.request, {
      body: await jsonBody(context, 8192),
    });
    const result = await factory(context.env, context.get('repository'), settings).login(
      input.body,
      requestSid(context.req.raw, settings),
    );
    const body = authOperations.authLogin.response.parse({ data: result.session });
    context.header(
      'set-cookie',
      sessionCookie(
        result.sid,
        settings,
        input.body.remember,
        Date.parse(result.session.authSession.expiresAt),
        serverClock.now(),
      ),
    );
    context.header('cache-control', 'no-store');
    return context.json(body);
  });
  routes.post('/refresh', async (context) => {
    await noInput(context);
    const settings = authSettings(context.env);
    const expected = context.req.header('X-Task8-Session-Id');
    if (expected !== undefined) parseRequest(EntityIdSchema, expected);
    const session = await factory(context.env, context.get('repository'), settings).refresh(
      requestSid(context.req.raw, settings),
      expected,
    );
    context.header('cache-control', 'no-store');
    return context.json(authOperations.authRefresh.response.parse({ data: session }));
  });
  routes.post('/logout', async (context) => {
    await noInput(context);
    const settings = authSettings(context.env);
    const expected = context.req.header('X-Task8-Session-Id');
    if (expected !== undefined) parseRequest(EntityIdSchema, expected);
    const result = await factory(context.env, context.get('repository'), settings).logout(
      requestSid(context.req.raw, settings),
      expected,
    );
    context.header(
      'set-cookie',
      `${settings.cookieName}=; Path=/; HttpOnly; SameSite=Lax${settings.secureCookie ? '; Secure' : ''}; Max-Age=0`,
    );
    context.header('cache-control', 'no-store');
    return context.json(authOperations.authLogout.response.parse({ data: result }));
  });
  return routes;
}

export { createBrowserAuthRoutes, createAuthMetadataRoutes } from './browser-routes.ts';
