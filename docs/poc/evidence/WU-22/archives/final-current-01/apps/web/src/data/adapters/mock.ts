import { DateRangeQuerySchema, EntityIdSchema } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { normalizeDescription } from '@studio/domain';
import { canReadMockProject as canReadProject, projectOperations, runProjectOperation, hasProjectUndo } from '../mock/projects.ts';
import type { Clock } from '@studio/domain';
import { StudioApiError, StudioTransportError, unavailable } from '../errors.ts';
import { createStudioClient } from '../operations.ts';
import { createEmptyDataset, createSeedDataset, fixtureClock } from '../mock/seed.ts';
import { readBootstrap, readSession } from '../mock/reads.ts';
import { loadMockDataset, persistMockDataset } from '../mock/persistence.ts';
import type { MockStorage } from '../mock/persistence.ts';
import { mockScenarios, waitForScenario } from '../mock/scenarios.ts';
import { runTaskFieldOperation, taskFieldOperations } from '../mock/task-fields.ts';
import { dashboardReads, readHome, readOverview } from '../mock/dashboards.ts';
import { readSearch } from '../mock/search.ts';
import type { MockScenarioId } from '../mock/scenarios.ts';
import { peopleReads, readMember, readMemberSummary } from '../mock/people.ts';
import { notificationOperations, runNotificationOperation } from '../mock/notifications.ts';
import { teamOperations, runTeamOperation, hasTeamUndo } from '../mock/teams.ts';

export const foundationReads = ['getSession', 'listWorkspaces', 'getBootstrap', 'getWorkspace', 'getProfile', 'getPreferences', 'getNotificationPreferences'] as const satisfies readonly OperationId[];
// WU-07 needs only saved-view identity/ownership for the static route boundary.
const shellReads = [...foundationReads, 'listSavedViews', 'listCalendarEvents', 'search'] as const;
export interface MockApiOptions {
  clock?: Clock; storage?: MockStorage; scenario?: MockScenarioId; environment?: 'development' | 'test' | 'production';
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export function createMockClient({ clock = fixtureClock, storage, scenario = 'populated', environment = 'production', wait = waitForScenario }: MockApiOptions = {}) {
  const state = mockScenarios[scenario];
  const fresh = () => state.dataset === 'empty' ? createEmptyDataset(clock) : createSeedDataset(clock);
  const seed = fresh();
  // System scenarios always start from their fixture and never overwrite the populated demo.
  let dataset = scenario === 'populated' ? loadMockDataset(storage, seed.workspaceId) ?? seed : seed;
  if (!dataset.taskCommands.taskFavorites[dataset.currentMemberId]) dataset.taskCommands.taskFavorites[dataset.currentMemberId] = (dataset.currentMemberId === seed.currentMemberId ? seed.taskCommands.taskFavorites[seed.currentMemberId] ?? [] : []);
  if (!dataset.projectCommands.favorites[dataset.currentMemberId]) dataset.projectCommands.favorites[dataset.currentMemberId] = (dataset.currentMemberId === seed.currentMemberId ? seed.projectCommands.favorites[seed.currentMemberId] ?? [] : []);
  for (const task of Object.values(dataset.tasks)) { const normalized = normalizeDescription(task.descriptionHtml); task.descriptionHtml = normalized.html; dataset.taskCommands.descriptionTexts[task.id] = normalized.text; }
  if (scenario === 'populated') persistMockDataset(storage, dataset);
  const client = createStudioClient(async (id, input, { signal }) => {
    if (![...shellReads, ...taskFieldOperations, ...projectOperations, ...dashboardReads, ...notificationOperations, ...peopleReads, ...teamOperations].includes(id as (typeof shellReads)[number] | (typeof taskFieldOperations)[number] | (typeof projectOperations)[number] | (typeof dashboardReads)[number] | (typeof notificationOperations)[number] | (typeof peopleReads)[number] | (typeof teamOperations)[number])) throw unavailable(id);
    await wait(state.delayMs, signal);
    if (state.failure === 'offline') throw new StudioTransportError('offline', 'Mock scenario is offline');
    if (state.failure === 'error') throw new StudioApiError({ error: { code: 'INTERNAL_ERROR', message: 'Mock scenario request failed' } });
    if (input.workspaceId && input.workspaceId !== dataset.workspaceId) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Workspace data is not available' } });
    if ((teamOperations as readonly string[]).includes(id) || id === 'undoCommand' && hasTeamUndo(dataset, input.undoId)) return runTeamOperation(id, input, dataset, clock, scenario === 'populated' && storage ? staged => persistMockDataset(storage, staged) : undefined);
    if ((notificationOperations as readonly string[]).includes(id)) { const result = runNotificationOperation(id, input, dataset, clock); if (scenario === 'populated') persistMockDataset(storage, dataset); return result; }
    if ((projectOperations as readonly string[]).includes(id) || id === 'undoCommand' && hasProjectUndo(dataset, input.undoId)) { const result = await runProjectOperation(id, input, dataset, clock); if (scenario === 'populated') persistMockDataset(storage, dataset); return result; }
    if ((taskFieldOperations as readonly string[]).includes(id)) { const fileWrite = ['renameFile', 'duplicateFile', 'uploadProjectFile', 'deleteFile'].includes(id) || id === 'undoCommand' && dataset.taskCommands.lifecycleUndoRecords[EntityIdSchema.parse(input.undoId)]?.kind === 'file.delete'; const result = await runTaskFieldOperation(id, input, dataset, clock, fileWrite && scenario === 'populated' && storage ? staged => persistMockDataset(storage, staged) : undefined); if (!fileWrite && scenario === 'populated') persistMockDataset(storage, dataset); return result; }
    switch (id) {
      case 'getMember': return { data: readMember(dataset, input.memberId) };
      case 'getMemberSummary': return { data: readMemberSummary(dataset, input.memberId, clock) };
      case 'search': return { data: await readSearch(dataset, input.query, clock) };
      case 'getHome': return { data: readHome(dataset, clock) };
      case 'getOverview': return { data: readOverview(dataset, clock) };
      case 'listCalendarEvents': {
        const query = DateRangeQuerySchema.parse(input.query);
        if (query.projectId && (!canReadProject(dataset.projects[query.projectId], dataset) || dataset.projects[query.projectId]!.archivedAt)) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
        return { data: Object.values(dataset.events).filter(event => event.workspaceId === dataset.workspaceId && event.date >= query.from && event.date <= query.to && (!query.projectId || event.projectId === query.projectId) && canReadProject(dataset.projects[event.projectId], dataset) && !dataset.projects[event.projectId]!.archivedAt).sort((a, b) => a.id.localeCompare(b.id)) };
      }
      case 'getSession': return { data: readSession(dataset) };
      case 'listWorkspaces': return { data: Object.values(dataset.workspaces) };
      case 'getBootstrap': return { data: readBootstrap(dataset, clock) };
      case 'getWorkspace': return { data: dataset.workspaces[dataset.workspaceId] };
      case 'getProfile': return { data: readSession(dataset).user };
      case 'getPreferences': return { data: dataset.preferences };
      case 'getNotificationPreferences': return { data: dataset.notificationPreferences };
      case 'listSavedViews': {
        const project = dataset.projects[EntityIdSchema.parse(input.projectId)];
        if (!project) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
        if (project.visibility === 'private' && !project.memberIds.includes(dataset.currentMemberId)) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
        return { data: Object.values(dataset.savedViews).filter(view => view.projectId === project.id) };
      }
      default: throw unavailable(id);
    }
  });
  return { ...client,
    reset() {
      if (environment === 'production') throw new StudioApiError({ error: { code: 'FORBIDDEN', message: 'Mock reset is only available in dev/test' } });
      dataset = fresh();
      if (scenario === 'populated') persistMockDataset(storage, dataset);
    },
  };
}

export function createMockApi(options: MockApiOptions = {}) { return createMockClient(options).api; }
