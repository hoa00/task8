import { EntityIdSchema } from '@studio/contracts/api';
import { createMiddleware } from 'hono/factory';
import { parseRequest } from './http/request.ts';
import { membership, principal } from './modules/members/index.ts';
import type { ApiEnvironment } from './runtime.ts';
import { ApiFailure } from './shared/errors.ts';
import { authSettings, requireOrigin, requestSid } from './modules/auth/http/index.ts';
import type { AuthServiceFactory } from './modules/auth/routes.ts';

export function createPrincipalMiddleware(
  createRepository: (
    bindings: ApiEnvironment['Bindings'],
  ) => ApiEnvironment['Variables']['repository'],
  authFactory: AuthServiceFactory,
) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    if (context.env.AUTH_MODE === 'ict24h') {
      const settings = authSettings(context.env);
      const repository = createRepository(context.env);
      context.set('repository', repository);
      const { session } = await authFactory(context.env, repository, settings).authenticate(
        requestSid(context.req.raw, settings),
      );
      if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
        requireOrigin(context.req.raw, settings);
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
  context.set('workspace', { workspaceId, memberId: member.id });
  context.set('currentMember', member);
  await next();
});
