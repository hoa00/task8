import { EntityIdSchema, MemberQuerySchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody, noInput, parseRequest, readQuery } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { ApiFailure } from '../../shared/errors.ts';
import { commandAuthority } from '../auth/index.ts';
import { serverClock } from '../../shared/clock.ts';
import { listMembers, member, memberSummary, updateProfile } from './index.ts';
type C = Context<ApiEnvironment>;
const scope = (c: C) => c.get('workspace'),
  repository = (c: C) => c.get('repository'),
  memberId = (c: C) => parseRequest(EntityIdSchema, c.req.param('memberId'));
export const memberRoutes = new Hono<ApiEnvironment>();
memberRoutes.get('/me/profile', async (c) => {
  await noInput(c);
  return c.json(operations.getProfile.response.parse({ data: c.get('principal').user }));
});
memberRoutes.patch('/me/profile', async (c) => {
  const input = parseRequest(operations.updateProfile.request, { body: await jsonBody(c) }),
    principal = c.get('principal');
  if (principal.currentWorkspaceId === null)
    throw new ApiFailure('FORBIDDEN', 'An active workspace membership is required');
  return c.json(
    operations.updateProfile.response.parse({
      data: await updateProfile(
        repository(c),
        principal.user.id,
        principal.currentWorkspaceId,
        input.body,
        serverClock.now(),
        commandAuthority(c.env.AUTH_MODE, principal),
      ),
    }),
  );
});
memberRoutes.get('/workspaces/:workspaceId/members', async (c) => {
  const query = parseRequest(MemberQuerySchema, await readQuery(c));
  return c.json(
    operations.listMembers.response.parse({
      data: await listMembers(repository(c), scope(c), query),
    }),
  );
});
memberRoutes.get('/workspaces/:workspaceId/members/:memberId', async (c) => {
  await noInput(c);
  return c.json(
    operations.getMember.response.parse({
      data: await member(repository(c), scope(c), memberId(c)),
    }),
  );
});
memberRoutes.get('/workspaces/:workspaceId/members/:memberId/summary', async (c) => {
  await noInput(c);
  return c.json(
    operations.getMemberSummary.response.parse({
      data: await memberSummary(repository(c), scope(c), memberId(c), serverClock.now()),
    }),
  );
});
