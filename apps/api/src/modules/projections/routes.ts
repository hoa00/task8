import {
  ArchiveQuerySchema,
  DateRangeQuerySchema,
  MilestoneQuerySchema,
  SearchQuerySchema,
  operations,
} from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { noInput as empty, parseRequest, readQuery as query } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { archive, calendar, home, overview, search } from './index.ts';
type C = Context<ApiEnvironment>;
const s = (c: C) => c.get('workspace'),
  r = (c: C) => c.get('repository'),
  W = '/workspaces/:workspaceId';
export const projectionRoutes = new Hono<ApiEnvironment>();
projectionRoutes.get(W + '/home', async (c) => {
  await empty(c);
  return c.json(
    operations.getHome.response.parse({
      data: await home(r(c), s(c), c.get('currentMember'), serverClock.now()),
    }),
  );
});
projectionRoutes.get(W + '/overview', async (c) => {
  await empty(c);
  return c.json(
    operations.getOverview.response.parse({
      data: await overview(r(c), s(c), c.get('currentMember'), serverClock.now()),
    }),
  );
});
projectionRoutes.get(W + '/search', async (c) => {
  const input = parseRequest(operations.search.request, {
    workspaceId: s(c).workspaceId,
    query: parseRequest(SearchQuerySchema, await query(c)),
  });
  return c.json(
    operations.search.response.parse({
      data: await search(r(c), s(c), input.query, serverClock.now()),
    }),
  );
});
projectionRoutes.get(W + '/archive', async (c) => {
  const input = parseRequest(operations.listArchive.request, {
    workspaceId: s(c).workspaceId,
    query: parseRequest(ArchiveQuerySchema, await query(c)),
  });
  return c.json(
    operations.listArchive.response.parse({
      data: await archive(r(c), s(c), input.query, serverClock.now()),
    }),
  );
});
for (const [suffix, op, milestones] of [
  ['calendar-events', 'listCalendarEvents', false],
  ['milestones', 'listMilestones', true],
] as const)
  projectionRoutes.get(W + '/' + suffix, async (c) => {
    const input = parseRequest(operations[op].request, {
      workspaceId: s(c).workspaceId,
      query: parseRequest(milestones ? MilestoneQuerySchema : DateRangeQuerySchema, await query(c)),
    });
    return c.json(
      operations[op].response.parse({ data: await calendar(r(c), s(c), input.query, milestones) }),
    );
  });
