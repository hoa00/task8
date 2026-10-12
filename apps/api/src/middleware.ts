import { EntityIdSchema, MemberSchema, UserProfileSchema } from '@studio/contracts/api';
import { and, eq, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { RequestRepository } from './db/repository.ts';
import { users, workspaceMembers } from './db/schema.ts';
import { parseRequest } from './http/request.ts';
import type { ApiEnvironment } from './runtime.ts';
import { ApiFailure } from './shared/errors.ts';

export const principalMiddleware = createMiddleware<ApiEnvironment>(async (context, next) => {
  const userId = EntityIdSchema.safeParse(context.env.LOCAL_USER_ID),
    currentWorkspaceId = EntityIdSchema.safeParse(context.env.LOCAL_WORKSPACE_ID);
  if (context.env.STUDIO_ENV !== 'local' || !userId.success || !currentWorkspaceId.success)
    throw new ApiFailure('UNAUTHENTICATED', 'Valid local principal required');
  const repository = new RequestRepository(context.env.DB);
  context.set('repository', repository);
  repository.reserve(1);
  const [identity] = await repository.db
    .select({ user: users })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(users.id, userId.data),
        eq(workspaceMembers.workspaceId, currentWorkspaceId.data),
        eq(workspaceMembers.status, 'active'),
        isNull(workspaceMembers.removedAt),
      ),
    )
    .limit(1);
  if (!identity) throw new ApiFailure('UNAUTHENTICATED', 'Valid local principal required');
  const u = identity.user;
  context.set('principal', {
    user: UserProfileSchema.parse({
      id: u.id,
      name: u.name,
      email: u.displayEmail,
      title: u.title,
      avatarColor: u.avatarColor,
      timezone: u.timezone,
      version: u.version,
    }),
    currentWorkspaceId: currentWorkspaceId.data,
  });
  await next();
});
export const workspaceMiddleware = createMiddleware<ApiEnvironment>(async (context, next) => {
  const workspaceId = parseRequest(EntityIdSchema, context.req.param('workspaceId'));
  const repository = context.get('repository');
  repository.reserve(1);
  const [row] = await repository.db
    .select({ member: workspaceMembers, user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, context.get('principal').user.id),
        eq(workspaceMembers.status, 'active'),
        isNull(workspaceMembers.removedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Workspace not found');
  const m = row.member,
    u = row.user;
  const member = MemberSchema.parse({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    name: u.name,
    email: u.displayEmail,
    title: u.title,
    avatarColor: u.avatarColor,
    timezone: u.timezone,
    role: m.role,
    status: m.status,
    teamId: m.teamId,
    lastSeenAt: m.lastSeenAt === null ? null : new Date(m.lastSeenAt).toISOString(),
    version: m.version,
  });
  context.set('workspace', { workspaceId, memberId: member.id });
  context.set('currentMember', member);
  await next();
});
