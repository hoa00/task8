import {
  EntityIdSchema,
  MemberQuerySchema,
  operations,
  ProjectQuerySchema,
  TextQuerySchema,
} from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  jsonBody as body,
  noInput as noQuery,
  parseRequest,
  readQuery as rawQuery,
} from '../http/request.ts';
import type { ApiEnvironment } from '../runtime.ts';
import { ApiFailure } from '../shared/errors.ts';
import { collaborationRoutes } from './collaboration-routes.ts';
import { fileRoutes } from './file-routes.ts';
import { projectionRoutes } from './projection-routes.ts';
import { createProject, duplicateProject, lifecycleProject, updateProject } from './projects.ts';
import type { TeamRow } from './read-model.ts';
import {
  activeTasks,
  member,
  members,
  projectCatalog,
  projectDto,
  projectRow,
  teamDto,
  teamRow,
  today,
} from './read-model.ts';
import { page } from './shared.ts';
import { taskRoutes } from './task-routes.ts';
import { deleteTeam, mutateTeam } from './teams.ts';
import { undoCommand } from './undo-command.ts';
import { readWorkspace, updateProfile, updateWorkspace } from './workspace.ts';
type C = Context<ApiEnvironment>;
const scope = (c: C) => c.get('workspace'),
  repo = (c: C) => c.get('repository'),
  pid = (c: C) => parseRequest(EntityIdSchema, c.req.param('projectId')),
  tid = (c: C) => parseRequest(EntityIdSchema, c.req.param('teamId'));

export const features = new Hono<ApiEnvironment>();
features.get('/me/profile', async (c) => {
  await noQuery(c);
  return c.json(operations.getProfile.response.parse({ data: c.get('principal').user }));
});
features.patch('/me/profile', async (c) => {
  const input = parseRequest(operations.updateProfile.request, { body: await body(c) });
  const principal = c.get('principal');
  return c.json(
    operations.updateProfile.response.parse({
      data: await updateProfile(
        repo(c),
        principal.user.id,
        principal.currentWorkspaceId,
        input.body,
        Date.now(),
      ),
    }),
  );
});
features.get('/workspaces/:workspaceId', async (c) => {
  await noQuery(c);
  return c.json(
    operations.getWorkspace.response.parse({
      data: await readWorkspace(repo(c), scope(c).workspaceId),
    }),
  );
});
features.patch('/workspaces/:workspaceId', async (c) => {
  const input = parseRequest(operations.updateWorkspace.request, {
    workspaceId: scope(c).workspaceId,
    body: await body(c),
  });
  return c.json(
    operations.updateWorkspace.response.parse({
      data: await updateWorkspace(
        repo(c),
        scope(c),
        c.get('currentMember'),
        input.body,
        Date.now(),
      ),
    }),
  );
});
features.get('/workspaces/:workspaceId/projects', async (c) => {
  const query = parseRequest(ProjectQuerySchema, await rawQuery(c)),
    rows = await projectCatalog(repo(c), scope(c), Date.now());
  // Restricted cards lack archivedAt. Lifecycle filtering uses only catalog root columns.
  const lifecycle = await repo(c).all<{ id: string; archivedAt: number | null }>(
    'SELECT id,archivedAt FROM projects WHERE workspaceId=? AND deletedAt IS NULL',
    [scope(c).workspaceId],
  );
  const selected = rows.filter(
    (row) =>
      !!lifecycle.find((p) => p.id === row.project.id)?.archivedAt === query.archived &&
      (!query.status || row.project.status === query.status) &&
      (!query.q ||
        row.project.name.toLowerCase().includes(query.q.toLowerCase()) ||
        (row.access === 'allowed' ? row.project.description : row.project.catalogSummary)
          .toLowerCase()
          .includes(query.q.toLowerCase())),
  );
  const value = (row: (typeof selected)[number]) =>
    query.sort === 'name'
      ? row.project.name
      : query.sort === 'due'
        ? (row.project.dueDate ?? '9999')
        : query.sort === 'progress'
          ? row.access === 'allowed'
            ? -row.summary.progress
            : 0
          : row.access === 'allowed'
            ? row.project.lastActivityAt
            : '';
  selected.sort((a, b) => {
    const av = value(a),
      bv = value(b),
      order =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
    return (query.sort === 'recent' ? -order : order) || a.project.id.localeCompare(b.project.id);
  });
  const result = await page(
    selected.map((row) => ({ id: row.project.id, row })),
    query,
    { scope: scope(c), kind: 'projects', ...query, cursor: undefined, limit: undefined },
    (item) => value(item.row),
    query.sort === 'due'
      ? 'due'
      : query.sort === 'recent'
        ? 'updated'
        : query.sort === 'progress'
          ? 'manual'
          : 'title',
  );
  return c.json(
    operations.listProjects.response.parse({
      data: { ...result, items: result.items.map((item) => item.row) },
    }),
  );
});
features.post('/workspaces/:workspaceId/projects', async (c) => {
  const input = parseRequest(operations.createProject.request, {
    workspaceId: scope(c).workspaceId,
    body: await body(c),
  });
  return c.json(
    operations.createProject.response.parse({
      data: await createProject(repo(c), scope(c), c.get('currentMember'), input.body, Date.now()),
    }),
    201,
  );
});
features.get('/workspaces/:workspaceId/projects/:projectId', async (c) => {
  await noQuery(c);
  const p = await projectRow(repo(c), scope(c), pid(c));
  return c.json(
    operations.getProject.response.parse({
      data: await projectDto(repo(c), scope(c), p, Date.now()),
    }),
  );
});
features.patch('/workspaces/:workspaceId/projects/:projectId', async (c) => {
  const input = parseRequest(operations.updateProject.request, {
    workspaceId: scope(c).workspaceId,
    projectId: pid(c),
    body: await body(c),
  });
  return c.json(
    operations.updateProject.response.parse({
      data: await updateProject(repo(c), scope(c), pid(c), input.body, Date.now()),
    }),
  );
});
features.post('/workspaces/:workspaceId/projects/:projectId/duplicate', async (c) => {
  const input = parseRequest(operations.duplicateProject.request, {
    workspaceId: scope(c).workspaceId,
    projectId: pid(c),
    body: await body(c),
  });
  return c.json(
    operations.duplicateProject.response.parse({
      data: await duplicateProject(
        repo(c),
        scope(c),
        c.get('currentMember'),
        pid(c),
        input.body,
        Date.now(),
      ),
    }),
  );
});
for (const [suffix, op, method] of [
  ['archive', 'archiveProject', 'post'],
  ['restore', 'restoreProject', 'post'],
  ['delete', 'deleteProject', 'delete'],
  ['restore-deleted', 'restoreDeletedProject', 'post'],
] as const) {
  const path =
    '/workspaces/:workspaceId/projects/:projectId' + (suffix === 'delete' ? '' : '/' + suffix);
  features[method](path, async (c) => {
    const input = parseRequest(operations[op].request, {
      workspaceId: scope(c).workspaceId,
      projectId: pid(c),
      body: await body(c),
    });
    return c.json(
      operations[op].response.parse({
        data: await lifecycleProject(
          repo(c),
          scope(c),
          pid(c),
          input.body.expectedVersion,
          suffix,
          Date.now(),
        ),
      }),
    );
  });
}
features.get('/workspaces/:workspaceId/projects/:projectId/members', async (c) => {
  await noQuery(c);
  await projectRow(repo(c), scope(c), pid(c), {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'read',
  });
  const grants = await repo(c).all<{ memberId: string; permission: string }>(
      'SELECT memberId,permission FROM projectMembers WHERE workspaceId=? AND projectId=? ORDER BY memberId',
      [scope(c).workspaceId, pid(c)],
    ),
    ms = await members(repo(c), scope(c));
  return c.json(
    operations.listProjectMembers.response.parse({
      data: grants.map((g) => ({
        member: ms.find((m) => m.id === g.memberId),
        permission: g.permission,
      })),
    }),
  );
});
features.get('/workspaces/:workspaceId/projects/:projectId/summary', async (c) => {
  await noQuery(c);
  await projectRow(repo(c), scope(c), pid(c), {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'read',
  });
  const row = (await projectCatalog(repo(c), scope(c), Date.now())).find(
    (p) => p.project.id === pid(c),
  );
  if (row?.access !== 'allowed') throw new ApiFailure('NOT_FOUND', 'Project not found');
  return c.json(operations.getProjectSummary.response.parse({ data: row.summary }));
});
features.get('/workspaces/:workspaceId/members', async (c) => {
  const query = parseRequest(MemberQuerySchema, await rawQuery(c)),
    rows = (await members(repo(c), scope(c)))
      .filter(
        (m) =>
          (!query.teamId || m.teamId === query.teamId) &&
          (!query.status || m.status === query.status) &&
          (!query.q ||
            [m.name, m.email, m.title].some((v) =>
              v.toLowerCase().includes(query.q.toLowerCase()),
            )),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return c.json(
    operations.listMembers.response.parse({
      data: await page(
        rows,
        query,
        { scope: scope(c), kind: 'members', ...query, cursor: undefined, limit: undefined },
        (m) => m.name,
      ),
    }),
  );
});
features.get('/workspaces/:workspaceId/members/:memberId', async (c) => {
  await noQuery(c);
  return c.json(
    operations.getMember.response.parse({
      data: await member(repo(c), scope(c), parseRequest(EntityIdSchema, c.req.param('memberId'))),
    }),
  );
});
features.get('/workspaces/:workspaceId/members/:memberId/summary', async (c) => {
  await noQuery(c);
  const m = await member(repo(c), scope(c), parseRequest(EntityIdSchema, c.req.param('memberId'))),
    ts = (await activeTasks(repo(c), scope(c))).filter((t) => t.assigneeId === m.id),
    date = await today(repo(c), scope(c), Date.now()),
    ps = await projectCatalog(repo(c), scope(c), Date.now());
  return c.json(
    operations.getMemberSummary.response.parse({
      data: {
        memberId: m.id,
        open: ts.filter((t) => t.status !== 'done').length,
        done: ts.filter((t) => t.status === 'done').length,
        overdue: ts.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < date).length,
        projects: ps.filter(
          (p) =>
            p.access === 'allowed' &&
            !p.project.archivedAt &&
            p.project.memberIds.includes(m.id) &&
            p.project.status !== 'complete',
        ),
      },
    }),
  );
});
features.get('/workspaces/:workspaceId/teams', async (c) => {
  const query = parseRequest(TextQuerySchema, await rawQuery(c)),
    rows = await repo(c).all<TeamRow>(
      'SELECT * FROM teams WHERE workspaceId=? AND deletedAt IS NULL ORDER BY name,id',
      [scope(c).workspaceId],
    ),
    ms = await members(repo(c), scope(c));
  return c.json(
    operations.listTeams.response.parse({
      data: rows
        .filter((t) => (t.name + ' ' + t.description).toLowerCase().includes(query.q.toLowerCase()))
        .map((t) => teamDto(t, ms)),
    }),
  );
});
features.get('/workspaces/:workspaceId/teams/:teamId', async (c) => {
  await noQuery(c);
  return c.json(
    operations.getTeam.response.parse({
      data: teamDto(await teamRow(repo(c), scope(c), tid(c)), await members(repo(c), scope(c))),
    }),
  );
});
features.post('/workspaces/:workspaceId/teams', async (c) => {
  const input = parseRequest(operations.createTeam.request, {
    workspaceId: scope(c).workspaceId,
    body: await body(c),
  });
  return c.json(
    operations.createTeam.response.parse({
      data: await mutateTeam(repo(c), scope(c), c.get('currentMember'), input.body, Date.now()),
    }),
    201,
  );
});
features.patch('/workspaces/:workspaceId/teams/:teamId', async (c) => {
  const input = parseRequest(operations.updateTeam.request, {
    workspaceId: scope(c).workspaceId,
    teamId: tid(c),
    body: await body(c),
  });
  return c.json(
    operations.updateTeam.response.parse({
      data: await mutateTeam(
        repo(c),
        scope(c),
        c.get('currentMember'),
        input.body,
        Date.now(),
        tid(c),
      ),
    }),
  );
});
features.delete('/workspaces/:workspaceId/teams/:teamId', async (c) => {
  const input = parseRequest(operations.deleteTeam.request, {
    workspaceId: scope(c).workspaceId,
    teamId: tid(c),
    body: await body(c),
  });
  return c.json(
    operations.deleteTeam.response.parse({
      data: await deleteTeam(
        repo(c),
        scope(c),
        c.get('currentMember'),
        tid(c),
        input.body.expectedVersion,
        Date.now(),
      ),
    }),
  );
});
features.get('/workspaces/:workspaceId/teams/:teamId/summary', async (c) => {
  await noQuery(c);
  const team = await teamRow(repo(c), scope(c), tid(c)),
    ms = (await members(repo(c), scope(c))).filter((m) => m.teamId === team.id),
    ts = (await activeTasks(repo(c), scope(c))).filter((t) =>
      ms.some((m) => m.id === t.assigneeId),
    ),
    ps = await projectCatalog(repo(c), scope(c), Date.now());
  return c.json(
    operations.getTeamSummary.response.parse({
      data: {
        teamId: team.id,
        open: ts.filter((t) => t.status !== 'done').length,
        completed: ts.filter((t) => t.status === 'done').length,
        projects: ps.filter(
          (p) => p.access === 'allowed' && !p.project.archivedAt && p.project.teamId === team.id,
        ),
        workload: ms.map((m) => ({
          memberId: m.id,
          open: ts.filter((t) => t.assigneeId === m.id && t.status !== 'done').length,
        })),
      },
    }),
  );
});
features.post('/workspaces/:workspaceId/undo/:undoId', async (c) => {
  const input = parseRequest(operations.undoCommand.request, {
    workspaceId: scope(c).workspaceId,
    undoId: parseRequest(EntityIdSchema, c.req.param('undoId')),
    body: await body(c),
  });
  return c.json(
    operations.undoCommand.response.parse({
      data: await undoCommand(
        repo(c),
        scope(c),
        c.get('currentMember'),
        input.undoId,
        Date.now(),
        c.env.FILES,
      ),
    }),
  );
});

features.route('/', taskRoutes);
features.route('/', collaborationRoutes);

features.route('/', projectionRoutes);

features.route('/', fileRoutes);
