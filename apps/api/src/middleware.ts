import { EntityIdSchema } from '@studio/contracts/api';
import { createMiddleware } from 'hono/factory';
import { parseRequest } from './http/request.ts';
import { membership, principal } from './modules/members/index.ts';
import type { ApiEnvironment } from './runtime.ts';
import { ApiFailure } from './shared/errors.ts';
import {
  authSettings,
  oidcSettings,
  requireOrigin,
  requestSid,
  requireCookieCsrf,
} from './modules/auth/http/index.ts';
import { commandAuthority, type OidcSessionService } from './modules/auth/index.ts';
import { createWorkspaceContext } from './shared/scope.ts';
import type { AuthServiceFactory } from './modules/auth/routes.ts';

export function createPrincipalMiddleware(
  createRepository: (
    bindings: ApiEnvironment['Bindings'],
  ) => ApiEnvironment['Variables']['repository'],
  authFactory: AuthServiceFactory,
  oidcFactory?: (
    bindings: ApiEnvironment['Bindings'],
    repository: ApiEnvironment['Variables']['repository'],
  ) => OidcSessionService,
) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    if (context.env.AUTH_MODE === 'oidc') {
      const settings = oidcSettings(context.env);
      if (!oidcFactory)
        throw new ApiFailure(
          'AUTH_SERVICE_UNAVAILABLE',
          'Authentication configuration is unavailable',
        );
      const repository = createRepository(context.env);
      context.set('repository', repository);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
        requireOrigin(context.req.raw, { appOrigin: settings.origin });
        await requireCookieCsrf(context.req.raw, settings.cookieName);
      }
      const { principal } = await oidcFactory(context.env, repository).authenticate(
        requestSid(context.req.raw, settings),
      );
      if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
        const expected = context.req.header('X-Task8-Session-Id');
        if (expected === undefined || expected !== principal.authSession.id)
          throw new ApiFailure('SESSION_CHANGED', 'The browser session has changed');
        parseRequest(EntityIdSchema, expected);
      }
      context.set('principal', principal);
      context.header('cache-control', 'no-store');
      await next();
      return;
    }
    if (context.env.AUTH_MODE === 'ict24h') {
      const settings = authSettings(context.env);
      const repository = createRepository(context.env);
      context.set('repository', repository);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
        requireOrigin(context.req.raw, settings);
        await requireCookieCsrf(context.req.raw, settings.cookieName);
      }
      const { session } = await authFactory(context.env, repository, settings).authenticate(
        requestSid(context.req.raw, settings),
      );
      if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
        const expected = context.req.header('X-Task8-Session-Id');
        if (expected === undefined || expected !== session.authSession.id)
          throw new ApiFailure('SESSION_CHANGED', 'The browser session has changed');
        parseRequest(EntityIdSchema, expected);
      }
      context.set('principal', {
        user: session.user,
        currentWorkspaceId: session.currentWorkspaceId,
        authSession: session.authSession,
      });
      context.header('cache-control', 'no-store');
      await next();
      return;
    }
    const userId = EntityIdSchema.safeParse(context.env.LOCAL_USER_ID),
      currentWorkspaceId = EntityIdSchema.safeParse(context.env.LOCAL_WORKSPACE_ID);
    if (
      context.env.AUTH_MODE !== 'local' ||
      context.env.STUDIO_ENV !== 'local' ||
      !userId.success ||
      !currentWorkspaceId.success
    )
      throw new ApiFailure('UNAUTHENTICATED', 'Valid local principal required');
    const repository = createRepository(context.env);
    context.set('repository', repository);
    context.set('principal', await principal(repository, userId.data, currentWorkspaceId.data));
    await next();
  });
}
export const workspaceMiddleware = createMiddleware<ApiEnvironment>(async (context, next) => {
  const workspaceId = parseRequest(EntityIdSchema, context.req.param('workspaceId'));
  const member = await membership(
    context.get('repository'),
    workspaceId,
    context.get('principal').user.id,
  );
  context.set(
    'workspace',
    createWorkspaceContext(
      workspaceId,
      member.id,
      commandAuthority(context.env.AUTH_MODE, context.get('principal')),
    ),
  );
  context.set('currentMember', member);
  await next();
});
