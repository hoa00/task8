import { DateRangeQuerySchema, EntityIdSchema, catalogs } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { normalizeDescription } from '@studio/domain';
import { canReadMockProject as canReadProject, projectOperations, runProjectOperation, hasProjectUndo } from '../mock/projects.ts';
import type { Clock } from '@studio/domain';
import { StudioApiError, StudioTransportError, unavailable } from '../errors.ts';
import { createStudioClient } from '../operations.ts';
import { createEmptyDataset, createSeedDataset, fixtureClock } from '../mock/seed.ts';
import { readBootstrap, readSession } from '../mock/reads.ts';
import { loadMockDataset, persistMockDataset, mockStorageKey } from '../mock/persistence.ts';
import type { MockStorage } from '../mock/persistence.ts';
import { mockScenarios, waitForScenario } from '../mock/scenarios.ts';
import { runTaskFieldOperation, taskFieldOperations } from '../mock/task-fields.ts';
import { dashboardReads, readHome, readOverview } from '../mock/dashboards.ts';
import { readSearch } from '../mock/search.ts';
import type { MockScenarioId } from '../mock/scenarios.ts';
import { peopleReads, readMember, readMemberSummary } from '../mock/people.ts';
import { notificationOperations, runNotificationOperation } from '../mock/notifications.ts';
import { teamOperations, runTeamOperation, hasTeamUndo } from '../mock/teams.ts';

import { settingsOperations, runSettingsOperation } from '../mock/settings.ts';
import { createOnboardingDataset } from '../mock/onboarding.ts';
import type { MockDataset } from '../mock/dataset.ts';
import type { OnboardingDraft, OnboardingResult } from '../onboarding-demo.ts';

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
  let activeDataset = scenario === 'populated' ? loadMockDataset(storage, seed.workspaceId) ?? seed : seed;
  const datasets = new Map<string, MockDataset>([[activeDataset.workspaceId, activeDataset]]);
  const catalogKey = 'task8.demo.onboarding.scopes.v1';
  if (scenario === 'populated') {
    try { const ids = JSON.parse(storage?.getItem(catalogKey) ?? '[]') as unknown; if (Array.isArray(ids)) for (const id of ids) if (EntityIdSchema.safeParse(id).success) { const restored = loadMockDataset(storage, String(id)); if (restored) datasets.set(restored.workspaceId, restored); } } catch { /* Invalid demo catalog does not expose a scope. */ }
  }
  let selected: string | null | undefined;
  try { selected = storage?.getItem('task8.demo.onboarding.selected.v1'); } catch { /* A blocked preference store leaves the seed selected. */ }
  if (scenario === 'populated' && selected && datasets.has(selected)) activeDataset = datasets.get(selected)!;
  const workspaceCatalog = () => [...new Map([...datasets.values()].flatMap(data => Object.values(data.workspaces)).map(workspace => [workspace.id, workspace])).values()];
  if (!activeDataset.taskCommands.taskFavorites[activeDataset.currentMemberId]) activeDataset.taskCommands.taskFavorites[activeDataset.currentMemberId] = (activeDataset.currentMemberId === seed.currentMemberId ? seed.taskCommands.taskFavorites[seed.currentMemberId] ?? [] : []);
  if (!activeDataset.projectCommands.favorites[activeDataset.currentMemberId]) activeDataset.projectCommands.favorites[activeDataset.currentMemberId] = (activeDataset.currentMemberId === seed.currentMemberId ? seed.projectCommands.favorites[seed.currentMemberId] ?? [] : []);
  for (const task of Object.values(activeDataset.tasks)) { const normalized = normalizeDescription(task.descriptionHtml); task.descriptionHtml = normalized.html; activeDataset.taskCommands.descriptionTexts[task.id] = normalized.text; }
  if (scenario === 'populated') persistMockDataset(storage, activeDataset);
  const client = createStudioClient(async (id, input, { signal }) => {
    // Capture scope before an await; concurrent reads cannot change another
    // request's principal or dataset.
    const scoped = typeof input.workspaceId === 'string' ? datasets.get(input.workspaceId) : activeDataset;
    if (!scoped) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Workspace data is not available' } });
    const dataset = scoped;
    if (![...shellReads, ...taskFieldOperations, ...projectOperations, ...dashboardReads, ...notificationOperations, ...peopleReads, ...teamOperations, ...settingsOperations].includes(id as (typeof shellReads)[number] | (typeof taskFieldOperations)[number] | (typeof projectOperations)[number] | (typeof dashboardReads)[number] | (typeof notificationOperations)[number] | (typeof peopleReads)[number] | (typeof teamOperations)[number] | (typeof settingsOperations)[number])) throw unavailable(id);
    await wait(state.delayMs, signal);
    if (state.failure === 'offline') throw new StudioTransportError('offline', 'Mock scenario is offline');
    if (state.failure === 'error') throw new StudioApiError({ error: { code: 'INTERNAL_ERROR', message: 'Mock scenario request failed' } });
    if (input.workspaceId && input.workspaceId !== dataset.workspaceId) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Workspace data is not available' } });
    if ((settingsOperations as readonly string[]).includes(id)) return runSettingsOperation(id, input, dataset, clock, scenario === 'populated' && storage ? staged => persistMockDataset(storage, staged) : undefined);
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
      case 'listWorkspaces': return { data: workspaceCatalog() };
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
  const completions = new Map<string, Promise<OnboardingResult>>();
  async function completeOnboarding(draft: OnboardingDraft): Promise<OnboardingResult> {
      if (scenario !== 'populated') throw unavailable('createProject');
      let scoped = datasets.get(draft.flowId) ?? loadMockDataset(storage, draft.flowId);
      if (!scoped) {
        scoped = await createOnboardingDataset(draft, clock);
        const project = scoped.projects[scoped.projectOrder[0]!]!, template = catalogs.templates.find(row => row.id === draft.tmpl)!;
        project.icon = template.icon === 'file' ? 'folder' : template.icon as typeof project.icon;
        if (storage && !persistMockDataset(storage, scoped)) throw Error('Demo workspace could not be saved. Try again.');
      }
      if (!scoped.onboardingReceipt || scoped.onboardingReceipt.flowId !== draft.flowId) throw Error('Demo setup receipt is unavailable');
      const selectedProjectId = scoped.onboardingReceipt.projectId;
      if (!scoped.projects[selectedProjectId] || scoped.projects[selectedProjectId]!.workspaceId !== draft.flowId) throw Error('Demo project is no longer available');
      // Keep the durable scope discoverable even if a receipt write fails.
      if (storage) storage.setItem(catalogKey, JSON.stringify([...new Set([...datasets.keys(), scoped.workspaceId])].filter(id => id !== seed.workspaceId)));
      datasets.set(scoped.workspaceId, scoped);
      return { workspaceId: scoped.workspaceId, projectId: selectedProjectId, mode: 'scoped-demo' };
    }
  return { ...client,
    selectWorkspace(workspaceId: string) { const selected = datasets.get(workspaceId); if (!selected) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Workspace data is not available' } }); activeDataset = selected; if (datasets.size > 1) { try { storage?.setItem('task8.demo.onboarding.selected.v1', workspaceId); } catch { /* UI selection remains operational in memory. */ } } },
    completeOnboarding(draft: OnboardingDraft): Promise<OnboardingResult> { const existing = completions.get(draft.flowId); if (existing) return existing; const promise = completeOnboarding(draft).finally(() => completions.delete(draft.flowId)); completions.set(draft.flowId, promise); return promise; },
    reset() {
      if (environment === 'production') throw new StudioApiError({ error: { code: 'FORBIDDEN', message: 'Mock reset is only available in dev/test' } });
      const demoIds = [...datasets.keys()].filter(id => id !== seed.workspaceId);
      activeDataset = fresh();
      datasets.clear();
      datasets.set(activeDataset.workspaceId, activeDataset);
      if (demoIds.length) { try { for (const id of demoIds) storage?.removeItem(mockStorageKey(id)); for (const key of [catalogKey, 'task8.demo.onboarding.selected.v1', 'task8.demo.onboarding.v1']) storage?.removeItem(key); } catch { /* Dev reset still clears in-memory scopes when storage is blocked. */ } }
      if (scenario === 'populated') persistMockDataset(storage, activeDataset);
    },
  };
}

export function createMockApi(options: MockApiOptions = {}) { return createMockClient(options).api; }
