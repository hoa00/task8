import { EntityIdSchema } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import { StudioApiError, StudioTransportError, unavailable } from '../errors.ts';
import { createStudioClient } from '../operations.ts';
import { createEmptyDataset, createSeedDataset, fixtureClock } from '../mock/seed.ts';
import { readBootstrap, readSession } from '../mock/reads.ts';
import { loadMockDataset, persistMockDataset } from '../mock/persistence.ts';
import type { MockStorage } from '../mock/persistence.ts';
import { mockScenarios, waitForScenario } from '../mock/scenarios.ts';
import type { MockScenarioId } from '../mock/scenarios.ts';

export const foundationReads = ['getSession', 'listWorkspaces', 'getBootstrap', 'getWorkspace', 'getProfile', 'getPreferences', 'getNotificationPreferences'] as const satisfies readonly OperationId[];
// WU-07 needs only saved-view identity/ownership for the static route boundary.
const shellReads = [...foundationReads, 'listSavedViews'] as const;
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
  if (scenario === 'populated') persistMockDataset(storage, dataset);
  const client = createStudioClient(async (id, input, { signal }) => {
    if (!(shellReads as readonly string[]).includes(id)) throw unavailable(id);
    await wait(state.delayMs, signal);
    if (state.failure === 'offline') throw new StudioTransportError('offline', 'Mock scenario is offline');
    if (state.failure === 'error') throw new StudioApiError({ error: { code: 'INTERNAL_ERROR', message: 'Mock scenario request failed' } });
    if (input.workspaceId && input.workspaceId !== dataset.workspaceId) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Workspace data is not available' } });
    switch (id) {
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
