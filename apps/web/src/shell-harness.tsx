import type { BootstrapDto } from '@studio/contracts/api';
import { summarizeTasks } from '@studio/domain';
// WU-07-only browser test fixture. Never part of the main or HTTP production graph.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { EntityIdSchema } from '@studio/contracts/api';
import { createMockClient } from './data/adapters/mock';
import { StudioTransportError, StudioApiError } from './data/errors';
import { createStudioClient } from './data/operations';
import { createEmptyDataset, fixtureClock } from './data/mock/seed';
import { readHome, readOverview } from './data/mock/dashboards';
import { runTaskFieldOperation, taskFieldOperations } from './data/mock/task-fields';
import { createStudioQueryClient, studioQueryOptions } from './data/queries';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioRouter } from './app/router';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import './styles/app.css';

const original = createMockClient({ environment: 'test' }),
  queryClient = createStudioQueryClient();
const session = (await original.api.getSession({})).data,
  catalog = (await original.api.listWorkspaces({})).data;
const workspaceA = EntityIdSchema.parse(session.currentWorkspaceId),
  workspaceB = catalog[1]!.id;
const a = (await original.api.getBootstrap({ workspaceId: workspaceA })).data;
const memberId = EntityIdSchema.parse('019f4800-0000-7000-8000-000000000001');
const b: BootstrapDto = {
  ...a,
  workspace: catalog[1]!,
  currentMember: { ...a.currentMember, id: memberId, workspaceId: workspaceB },
  members: [{ id: memberId, name: a.currentMember.name, avatarColor: a.currentMember.avatarColor }],
  projects: [],
  teams: [],
  unreadCount: 0,
  navigationCounts: { inbox: 0, myTasks: 0, archive: 0 },
};
// The real Home consumer now reads aggregates and complete tasks in addition to
// Bootstrap. Ordinary mock clients own the locked seed workspace; the explicitly
// synthetic second workspace uses the same canonical handlers/contract validation.
const empty = createEmptyDataset();
empty.workspaceId = workspaceB;
empty.currentMemberId = memberId;
empty.members = { [memberId]: { ...b.currentMember, teamId: null } };
let holdCreate = false,
  releaseCreate: (() => void) | undefined,
  completedCreates = 0;
let delayOld = false,
  releaseOld: (() => void) | undefined,
  aborted = false;
let bootstrapScenario: 'ready' | 'loading' | 'error' = 'ready',
  releaseBootstrap: (() => void) | undefined;
let holdSavedViews = false;
const savedViewWaiters: (() => void)[] = [];
const requests: { id: string; workspaceId: unknown }[] = [];
let linkedTaskFailure: {
  taskId: string;
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_ERROR';
} | null = null;
const client = createStudioClient(async (id, input, options) => {
  requests.push({ id, workspaceId: input.workspaceId });
  if (id === 'listSavedViews' && holdSavedViews)
    await new Promise<void>((resolve) => savedViewWaiters.push(resolve));
  if (id === 'getTask' && linkedTaskFailure && linkedTaskFailure.taskId === input.taskId)
    throw new StudioApiError({
      error: { code: linkedTaskFailure.code, message: 'QA linked task unavailable' },
    });
  if (id === 'createTask' && holdCreate) {
    holdCreate = false;
    await new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    releaseCreate = undefined;
    const result = await original.execute(id, input as never, options);
    completedCreates++;
    return result;
  }
  if (id === 'getBootstrap' && input.workspaceId === workspaceB) {
    if (bootstrapScenario === 'loading')
      await new Promise<void>((resolve) => {
        releaseBootstrap = resolve;
      });
    if (bootstrapScenario === 'error')
      throw new StudioTransportError('offline', 'Test bootstrap offline');
    return { data: b };
  }
  if (id === 'getBootstrap' && input.workspaceId === workspaceA && delayOld) {
    delayOld = false;
    options.signal?.addEventListener(
      'abort',
      () => {
        aborted = true;
      },
      { once: true },
    );
    await new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    return { data: { ...a, workspace: { ...a.workspace, name: 'STALE A' } } };
  }
  if (input.workspaceId === workspaceB) {
    if (id === 'getHome') return { data: readHome(empty, fixtureClock) };
    if (id === 'getOverview') return { data: readOverview(empty, fixtureClock) };
    if ((taskFieldOperations as readonly string[]).includes(id))
      return runTaskFieldOperation(id, input, empty, fixtureClock);
  }
  return original.execute(id, input as never, options);
});
const router = createStudioRouter({ runtime: { client, clock: fixtureClock }, queryClient });
const controls = {
  setLocale: async (lang: 'vi' | 'en') => {
    await client.api.updatePreferences({ workspaceId: workspaceA, body: { lang } });
    queryClient.setQueryData(
      studioQueryOptions(client, 'getBootstrap', { workspaceId: workspaceA }).queryKey,
      await client.api.getBootstrap({ workspaceId: workspaceA }),
    );
  },
  holdSavedViews: () => {
    holdSavedViews = true;
  },
  releaseSavedViews: () => {
    holdSavedViews = false;
    savedViewWaiters.splice(0).forEach((resolve) => resolve());
  },
  today: fixtureClock.today(),
  requests: () => structuredClone(requests),
  clearRequests: () => {
    requests.length = 0;
  },
  failLinkedTask: (taskId: string, code: 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_ERROR') => {
    linkedTaskFailure = { taskId, code };
    queryClient.removeQueries({ queryKey: ['workspace', workspaceA, 'task', taskId] });
  },
  clearTaskFailure: () => {
    linkedTaskFailure = null;
  },
  client,
  workspaceA,
  workspaceB,
  enableWritableB: () => {
    const originalProject = a.projects.find((row) => row.access === 'allowed')!;
    if (originalProject.access !== 'allowed') throw Error('Missing QA project');
    const id = EntityIdSchema.parse('019f4800-0000-7000-8000-000000000002');
    const project = {
      ...originalProject.project,
      id,
      workspaceId: workspaceB,
      name: 'Workspace B QA',
      key: 'BQA',
      teamId: null,
      leadId: memberId,
      memberIds: [memberId],
      milestones: [],
    };
    empty.projects[id] = project;
    empty.projectOrder = [id];
    b.projects = [
      {
        access: 'allowed',
        project,
        summary: {
          projectId: id,
          taskSummary: summarizeTasks([], fixtureClock.today()),
          progress: 0,
        },
      },
    ];
    queryClient.removeQueries({
      queryKey: studioQueryOptions(client, 'getBootstrap', { workspaceId: workspaceB }).queryKey,
    });
  },
  holdNextCreate: () => {
    holdCreate = true;
  },
  createIsHeld: () => !!releaseCreate,
  releaseCreate: () => releaseCreate?.(),
  completedCreates: () => completedCreates,
  setBootstrapScenario: (scenario: 'ready' | 'loading' | 'error') => {
    bootstrapScenario = scenario;
    queryClient.removeQueries({
      queryKey: studioQueryOptions(client, 'getBootstrap', { workspaceId: workspaceB }).queryKey,
    });
  },
  releaseBootstrap: () => {
    bootstrapScenario = 'ready';
    releaseBootstrap?.();
  },
  navigate: (href: string) => router.navigate({ href }),
  delayOldResponse: () => {
    delayOld = true;
    void queryClient.refetchQueries({
      queryKey: studioQueryOptions(client, 'getBootstrap', { workspaceId: workspaceA }).queryKey,
    });
  },
  releaseOldResponse: () => releaseOld?.(),
  inspect: () => ({
    aborted,
    queryKeys: queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
    oldData: queryClient.getQueryData(
      studioQueryOptions(client, 'getBootstrap', { workspaceId: workspaceA }).queryKey,
    ),
    matches: router.state.matches.map((match) => match.routeId),
    scope: router.options.context?.navigation.workspaceId,
  }),
};
Object.assign(window, { __shellHarness: controls });
applyRootPreferences(readThemePreferences());
const root = document.getElementById('root');
if (!root) throw Error('Missing shell test root');
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <StudioDataProvider runtime={{ client, clock: fixtureClock }} queryClient={queryClient}>
        <RouterProvider router={router} />
      </StudioDataProvider>
    </ThemeProvider>
  </StrictMode>,
);
