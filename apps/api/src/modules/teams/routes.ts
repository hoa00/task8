import { EntityIdSchema, TextQuerySchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody, noInput, parseRequest, readQuery } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { deleteTeam, listTeams, mutateTeam, readTeam, teamSummary } from './index.ts';
type C = Context<ApiEnvironment>;
const scope = (c: C) => c.get('workspace'),
  repository = (c: C) => c.get('repository'),
  teamId = (c: C) => parseRequest(EntityIdSchema, c.req.param('teamId'));
export const teamRoutes = new Hono<ApiEnvironment>();
const W = '/workspaces/:workspaceId/teams';
teamRoutes.get(W, async (c) => {
  const query = parseRequest(TextQuerySchema, await readQuery(c));
  return c.json(
    operations.listTeams.response.parse({ data: await listTeams(repository(c), scope(c), query) }),
  );
});
teamRoutes.get(W + '/:teamId', async (c) => {
  await noInput(c);
  return c.json(
    operations.getTeam.response.parse({ data: await readTeam(repository(c), scope(c), teamId(c)) }),
  );
});
teamRoutes.post(W, async (c) => {
  const input = parseRequest(operations.createTeam.request, {
    workspaceId: scope(c).workspaceId,
    body: await jsonBody(c),
  });
  return c.json(
    operations.createTeam.response.parse({
      data: await mutateTeam(
        repository(c),
        scope(c),
        c.get('currentMember'),
        { kind: 'create', input: input.body },
        serverClock.now(),
      ),
    }),
    201,
  );
});
teamRoutes.patch(W + '/:teamId', async (c) => {
  const input = parseRequest(operations.updateTeam.request, {
    workspaceId: scope(c).workspaceId,
    teamId: teamId(c),
    body: await jsonBody(c),
  });
  return c.json(
    operations.updateTeam.response.parse({
      data: await mutateTeam(
        repository(c),
        scope(c),
        c.get('currentMember'),
        { kind: 'update', id: teamId(c), input: input.body },
        serverClock.now(),
      ),
    }),
  );
});
teamRoutes.delete(W + '/:teamId', async (c) => {
  const input = parseRequest(operations.deleteTeam.request, {
    workspaceId: scope(c).workspaceId,
    teamId: teamId(c),
    body: await jsonBody(c),
  });
  return c.json(
    operations.deleteTeam.response.parse({
      data: await deleteTeam(
        repository(c),
        scope(c),
        c.get('currentMember'),
        teamId(c),
        input.body.expectedVersion,
        serverClock.now(),
      ),
    }),
  );
});
teamRoutes.get(W + '/:teamId/summary', async (c) => {
  await noInput(c);
  return c.json(
    operations.getTeamSummary.response.parse({
      data: await teamSummary(repository(c), scope(c), teamId(c), serverClock.now()),
    }),
  );
});
