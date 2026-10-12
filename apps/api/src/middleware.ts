import { EntityIdSchema } from '@studio/contracts/api';
import { createMiddleware } from 'hono/factory';
import { parseRequest } from './http/request.ts';
import { membership, principal } from './modules/members/index.ts';
import type { ApiEnvironment } from './runtime.ts';
import { ApiFailure } from './shared/errors.ts';

export function createPrincipalMiddleware(
  createRepository: (bindings: CloudflareBindings) => ApiEnvironment['Variables']['repository'],
) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    const userId = EntityIdSchema.safeParse(context.env.LOCAL_USER_ID),
      currentWorkspaceId = EntityIdSchema.safeParse(context.env.LOCAL_WORKSPACE_ID);
    if (context.env.STUDIO_ENV !== 'local' || !userId.success || !currentWorkspaceId.success)
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
