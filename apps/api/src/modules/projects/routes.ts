import { EntityIdSchema, ProjectQuerySchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { jsonBody, noInput, parseRequest, readQuery } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import {
  createProject,
  duplicateProject,
  lifecycleProject,
  listProjectMembers,
  listProjects,
  projectSummary,
  readProject,
  updateProject,
} from './index.ts';
type C = Context<ApiEnvironment>;
const scope = (c: C) => c.get('workspace'),
  repository = (c: C) => c.get('repository'),
  projectId = (c: C) => parseRequest(EntityIdSchema, c.req.param('projectId'));
export const projectRoutes = new Hono<ApiEnvironment>();
const W = '/workspaces/:workspaceId/projects';
projectRoutes.get(W, async (c) => {
  const query = parseRequest(ProjectQuerySchema, await readQuery(c));
  return c.json(
    operations.listProjects.response.parse({
      data: await listProjects(repository(c), scope(c), query, serverClock.now()),
    }),
  );
});
projectRoutes.post(W, async (c) => {
  const input = parseRequest(operations.createProject.request, {
    workspaceId: scope(c).workspaceId,
    body: await jsonBody(c),
  });
  return c.json(
    operations.createProject.response.parse({
      data: await createProject(
        repository(c),
        scope(c),
        c.get('currentMember'),
        input.body,
        serverClock.now(),
      ),
    }),
    201,
  );
});
projectRoutes.get(W + '/:projectId', async (c) => {
  await noInput(c);
  return c.json(
    operations.getProject.response.parse({
      data: await readProject(repository(c), scope(c), projectId(c), serverClock.now()),
    }),
  );
});
projectRoutes.patch(W + '/:projectId', async (c) => {
  const input = parseRequest(operations.updateProject.request, {
    workspaceId: scope(c).workspaceId,
    projectId: projectId(c),
    body: await jsonBody(c),
  });
  return c.json(
    operations.updateProject.response.parse({
      data: await updateProject(
        repository(c),
        scope(c),
        projectId(c),
        input.body,
        serverClock.now(),
      ),
    }),
  );
});
projectRoutes.post(W + '/:projectId/duplicate', async (c) => {
  const input = parseRequest(operations.duplicateProject.request, {
    workspaceId: scope(c).workspaceId,
    projectId: projectId(c),
    body: await jsonBody(c),
  });
  return c.json(
    operations.duplicateProject.response.parse({
      data: await duplicateProject(
        repository(c),
        scope(c),
        c.get('currentMember'),
        projectId(c),
        input.body,
        serverClock.now(),
      ),
    }),
  );
});
for (const [suffix, operation, method] of [
  ['archive', 'archiveProject', 'post'],
  ['restore', 'restoreProject', 'post'],
  ['delete', 'deleteProject', 'delete'],
  ['restore-deleted', 'restoreDeletedProject', 'post'],
] as const)
  projectRoutes[method](
    W + '/:projectId' + (suffix === 'delete' ? '' : '/' + suffix),
    async (c) => {
      const input = parseRequest(operations[operation].request, {
        workspaceId: scope(c).workspaceId,
        projectId: projectId(c),
        body: await jsonBody(c),
      });
      return c.json(
        operations[operation].response.parse({
          data: await lifecycleProject(
            repository(c),
            scope(c),
            projectId(c),
            input.body.expectedVersion,
            suffix,
            serverClock.now(),
          ),
        }),
      );
    },
  );
projectRoutes.get(W + '/:projectId/members', async (c) => {
  await noInput(c);
  return c.json(
    operations.listProjectMembers.response.parse({
      data: await listProjectMembers(repository(c), scope(c), projectId(c)),
    }),
  );
});
projectRoutes.get(W + '/:projectId/summary', async (c) => {
  await noInput(c);
  return c.json(
    operations.getProjectSummary.response.parse({
      data: await projectSummary(repository(c), scope(c), projectId(c), serverClock.now()),
    }),
  );
});
