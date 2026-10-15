import { readMockProjection } from '../mock/projection-reads.ts';
import { transactMock } from '../mock/transaction.ts';
import { EntityIdSchema, catalogs, operations } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { normalizeDescription } from '@studio/domain';
import { projectOperations, runProjectOperation, hasProjectUndo } from '../mock/projects.ts';
import type { Clock } from '@studio/domain';
import { StudioApiError, StudioTransportError, unavailable } from '../errors.ts';
import { createStudioClient } from '../operations.ts';
import { createEmptyDataset, createSeedDataset, fixtureClock } from '../mock/seed.ts';
import { loadMockDataset, persistMockDataset, mockStorageKey } from '../mock/persistence.ts';
import type { MockStorage } from '../mock/persistence.ts';
import { mockScenarios, waitForScenario } from '../mock/scenarios.ts';
import {
  runTaskOperation as runTaskFieldOperation,
  taskOperationIds as taskFieldOperations,
} from '../mock/operation-registry.ts';
import { dashboardReads } from '../mock/dashboards.ts';
import type { MockScenarioId } from '../mock/scenarios.ts';
import { peopleReads } from '../mock/people.ts';
import { notificationOperations, runNotificationCommand } from '../mock/notifications.ts';
import { teamOperations, runTeamOperation, hasTeamUndo } from '../mock/teams.ts';

import { settingsOperations, runSettingsOperation } from '../mock/settings.ts';
import { createOnboardingDataset } from '../mock/onboarding.ts';
import type { MockDataset } from '../mock/dataset.ts';
import type { OnboardingDraft, OnboardingResult } from '../onboarding-demo.ts';

export const foundationReads = [
  'getSession',
  'listWorkspaces',
  'getBootstrap',
  'getWorkspace',
  'getProfile',
  'getPreferences',
  'getNotificationPreferences',
] as const satisfies readonly OperationId[];
// WU-07 needs only saved-view identity/ownership for the static route boundary.
const shellReads = [
  ...foundationReads,
  'listArchive',
  'listSavedViews',
  'listCalendarEvents',
  'search',
] as const;
export interface MockApiOptions {
  clock?: Clock;
  storage?: MockStorage;
  scenario?: MockScenarioId;
  environment?: 'development' | 'test' | 'production';
  allowDemoReset?: boolean;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export function createMockClient({
  clock = fixtureClock,
  storage,
  scenario = 'populated',
  environment = 'production',
  allowDemoReset = false,
  wait = waitForScenario,
}: MockApiOptions = {}) {
  const state = mockScenarios[scenario];
  let demoOffline = false;
  const fresh = () =>
    state.dataset === 'empty' ? createEmptyDataset(clock) : createSeedDataset(clock);
  const seed = fresh();
  // System scenarios always start from their fixture and never overwrite the populated demo.
  let activeDataset =
    scenario === 'populated' ? (loadMockDataset(storage, seed.workspaceId) ?? seed) : seed;
  const datasets = new Map<string, MockDataset>([[activeDataset.workspaceId, activeDataset]]);
  const catalogKey = 'task8.demo.onboarding.scopes.v1';
  if (scenario === 'populated') {
    try {
      const ids = JSON.parse(storage?.getItem(catalogKey) ?? '[]') as unknown;
      if (Array.isArray(ids))
        for (const id of ids)
          if (EntityIdSchema.safeParse(id).success) {
            const restored = loadMockDataset(storage, String(id));
            if (restored) datasets.set(restored.workspaceId, restored);
          }
    } catch {
      /* Invalid demo catalog does not expose a scope. */
    }
  }
  let selected: string | null | undefined;
  try {
    selected = storage?.getItem('task8.demo.onboarding.selected.v1');
  } catch {
    /* A blocked preference store leaves the seed selected. */
  }
  if (scenario === 'populated' && selected && datasets.has(selected))
    activeDataset = datasets.get(selected)!;
  const canonicalPrincipal = datasets.get(seed.workspaceId)!;
  const canonicalUserId = canonicalPrincipal.members[canonicalPrincipal.currentMemberId]!.userId;
  function reconcilePrincipal(scoped: MockDataset) {
    const user = canonicalPrincipal.users[canonicalUserId]!;
    for (const member of Object.values(scoped.members))
      if (member.userId === user.id) {
        const revisionDelta = Math.max(
          0,
          user.version - (scoped.users[user.id]?.version ?? user.version),
        );
        const changed = ['name', 'email', 'title', 'avatarColor', 'timezone'].some(
          (key) => member[key as keyof typeof member] !== user[key as keyof typeof user],
        );
        Object.assign(member, {
          name: user.name,
          email: user.email,
          title: user.title,
          avatarColor: user.avatarColor,
          timezone: user.timezone,
          ...((changed || revisionDelta) && scoped !== canonicalPrincipal
            ? { version: member.version + Math.max(1, revisionDelta) }
            : {}),
        });
        scoped.users[user.id] = structuredClone(user);
      }
  }
  function syncPrincipal(scoped: MockDataset) {
    const user = canonicalPrincipal.users[canonicalUserId]!;
    const changed = Object.values(scoped.members).some(
      (member) =>
        member.userId === user.id &&
        (scoped.users[user.id]?.version !== user.version ||
          ['name', 'email', 'title', 'avatarColor', 'timezone'].some(
            (key) => member[key as keyof typeof member] !== user[key as keyof typeof user],
          )),
    );
    if (changed)
      return transactMock(scoped, async (staged) => {
        reconcilePrincipal(staged);
      });
  }
  const workspaceCatalog = () => [
    ...new Map(
      [...datasets.values()]
        .flatMap((data) => Object.values(data.workspaces))
        .map((workspace) => [workspace.id, workspace]),
    ).values(),
  ];
  if (!activeDataset.taskCommands.taskFavorites[activeDataset.currentMemberId])
    activeDataset.taskCommands.taskFavorites[activeDataset.currentMemberId] =
      activeDataset.currentMemberId === seed.currentMemberId
        ? (seed.taskCommands.taskFavorites[seed.currentMemberId] ?? [])
        : [];
  if (!activeDataset.projectCommands.favorites[activeDataset.currentMemberId])
    activeDataset.projectCommands.favorites[activeDataset.currentMemberId] =
      activeDataset.currentMemberId === seed.currentMemberId
        ? (seed.projectCommands.favorites[seed.currentMemberId] ?? [])
        : [];
  for (const task of Object.values(activeDataset.tasks)) {
    const normalized = normalizeDescription(task.descriptionHtml);
    task.descriptionHtml = normalized.html;
    activeDataset.taskCommands.descriptionTexts[task.id] = normalized.text;
  }
  if (scenario === 'populated') persistMockDataset(storage, activeDataset);
  const client = createStudioClient(async (id, input, { signal }) => {
    // Capture scope before an await; concurrent reads cannot change another
    // request's principal or dataset.
    const scoped =
      typeof input.workspaceId === 'string' ? datasets.get(input.workspaceId) : activeDataset;
    if (!scoped)
      throw new StudioApiError({
        error: { code: 'NOT_FOUND', message: 'Workspace data is not available' },
      });
    const dataset = scoped;
    const principalSync = syncPrincipal(dataset);
    if (principalSync) await principalSync;
    if (
      ![
        ...shellReads,
        ...taskFieldOperations,
        ...projectOperations,
        ...dashboardReads,
        ...notificationOperations,
        ...peopleReads,
        ...teamOperations,
        ...settingsOperations,
      ].includes(
        id as
          | (typeof shellReads)[number]
          | (typeof taskFieldOperations)[number]
          | (typeof projectOperations)[number]
          | (typeof dashboardReads)[number]
          | (typeof notificationOperations)[number]
          | (typeof peopleReads)[number]
          | (typeof teamOperations)[number]
          | (typeof settingsOperations)[number],
      )
    )
      throw unavailable(id);
    await wait(state.delayMs, signal);
    if (demoOffline && operations[id].method !== 'GET')
      throw new StudioTransportError('offline', 'Offline demo — changes were not saved');
    if (state.failure === 'offline')
      throw new StudioTransportError('offline', 'Mock scenario is offline');
    if (state.failure === 'error')
      throw new StudioApiError({
        error: { code: 'INTERNAL_ERROR', message: 'Mock scenario request failed' },
      });
    if (input.workspaceId && input.workspaceId !== dataset.workspaceId)
      throw new StudioApiError({
        error: { code: 'NOT_FOUND', message: 'Workspace data is not available' },
      });
    if ((settingsOperations as readonly string[]).includes(id)) {
      const settingsScope = id === 'updateProfile' ? canonicalPrincipal : dataset;
      const result = await runSettingsOperation(
        id,
        input,
        settingsScope,
        clock,
        scenario === 'populated' && storage
          ? (staged) => persistMockDataset(storage, staged)
          : undefined,
      );
      if (id === 'updateProfile')
        for (const scoped of datasets.values()) await syncPrincipal(scoped);
      return result;
    }
    if (
      (teamOperations as readonly string[]).includes(id) ||
      (id === 'undoCommand' && hasTeamUndo(dataset, input.undoId))
    )
      return runTeamOperation(
        id,
        input,
        dataset,
        clock,
        scenario === 'populated' && storage
          ? (staged) => persistMockDataset(storage, staged)
          : undefined,
      );
    if ((notificationOperations as readonly string[]).includes(id))
      return runNotificationCommand(
        id,
        input,
        dataset,
        clock,
        scenario === 'populated' && storage
          ? (staged) => persistMockDataset(storage, staged)
          : undefined,
      );
    if (
      (projectOperations as readonly string[]).includes(id) ||
      (id === 'undoCommand' && hasProjectUndo(dataset, input.undoId))
    ) {
      const result = await runProjectOperation(
        id,
        input,
        dataset,
        clock,
        scenario === 'populated' && storage
          ? (staged) => persistMockDataset(storage, staged)
          : undefined,
      );
      if (scenario === 'populated' && !storage) persistMockDataset(storage, dataset);
      return result;
    }
    if ((taskFieldOperations as readonly string[]).includes(id))
      return runTaskFieldOperation(
        id,
        input,
        dataset,
        clock,
        scenario === 'populated' && storage
          ? (staged) => persistMockDataset(storage, staged)
          : undefined,
      );
    return readMockProjection(id, input, dataset, clock, workspaceCatalog);
  });
  const completions = new Map<string, Promise<OnboardingResult>>();
  async function completeOnboarding(draft: OnboardingDraft): Promise<OnboardingResult> {
    if (scenario !== 'populated') throw unavailable('createProject');
    let scoped = datasets.get(draft.flowId) ?? loadMockDataset(storage, draft.flowId);
    if (!scoped) {
      await syncPrincipal(activeDataset);
      scoped = await createOnboardingDataset(draft, clock, activeDataset);
      const project = scoped.projects[scoped.projectOrder[0]!]!,
        template = catalogs.templates.find((row) => row.id === draft.tmpl)!;
      project.icon = template.icon === 'file' ? 'folder' : (template.icon as typeof project.icon);
      if (storage && !persistMockDataset(storage, scoped))
        throw Error('Demo workspace could not be saved. Try again.');
    }
    if (!scoped.onboardingReceipt || scoped.onboardingReceipt.flowId !== draft.flowId)
      throw Error('Demo setup receipt is unavailable');
    const selectedProjectId = scoped.onboardingReceipt.projectId;
    if (
      !scoped.projects[selectedProjectId] ||
      scoped.projects[selectedProjectId]!.workspaceId !== draft.flowId
    )
      throw Error('Demo project is no longer available');
    // Keep the durable scope discoverable even if a receipt write fails.
    if (storage)
      storage.setItem(
        catalogKey,
        JSON.stringify(
          [...new Set([...datasets.keys(), scoped.workspaceId])].filter(
            (id) => id !== seed.workspaceId,
          ),
        ),
      );
    datasets.set(scoped.workspaceId, scoped);
    return { workspaceId: scoped.workspaceId, projectId: selectedProjectId, mode: 'scoped-demo' };
  }
  return {
    ...client,
    selectWorkspace(workspaceId: string) {
      const selected = datasets.get(workspaceId);
      if (!selected)
        throw new StudioApiError({
          error: { code: 'NOT_FOUND', message: 'Workspace data is not available' },
        });
      activeDataset = selected;
      if (datasets.size > 1) {
        try {
          storage?.setItem('task8.demo.onboarding.selected.v1', workspaceId);
        } catch {
          /* UI selection remains operational in memory. */
        }
      }
    },
    completeOnboarding(draft: OnboardingDraft): Promise<OnboardingResult> {
      const existing = completions.get(draft.flowId);
      if (existing) return existing;
      const promise = completeOnboarding(draft).finally(() => completions.delete(draft.flowId));
      completions.set(draft.flowId, promise);
      return promise;
    },
    isDemoOffline() {
      return demoOffline;
    },
    setDemoOffline(value: boolean) {
      if (environment === 'production' && !allowDemoReset)
        throw new StudioApiError({
          error: { code: 'FORBIDDEN', message: 'Offline scenarios require dev/POC boundary' },
        });
      demoOffline = value;
    },
    reset({ durable = false }: { durable?: boolean } = {}) {
      if (environment === 'production' && !allowDemoReset)
        throw new StudioApiError({
          error: { code: 'FORBIDDEN', message: 'Mock reset is only available in dev/test' },
        });
      const demoIds = [...datasets.keys()].filter((id) => id !== seed.workspaceId);
      const resetDataset = fresh();
      resetDataset.preferences.theme = activeDataset.preferences.theme;
      if (
        scenario === 'populated' &&
        storage &&
        !persistMockDataset(storage, resetDataset) &&
        durable
      )
        throw new StudioApiError({
          error: { code: 'INTERNAL_ERROR', message: 'Demo data could not be restored. Try again.' },
        });
      activeDataset = resetDataset;
      demoOffline = false;
      datasets.clear();
      Object.assign(canonicalPrincipal, structuredClone(activeDataset));
      activeDataset = canonicalPrincipal;
      datasets.set(activeDataset.workspaceId, activeDataset);
      if (demoIds.length) {
        try {
          for (const id of demoIds) storage?.removeItem(mockStorageKey(id));
          for (const key of [
            catalogKey,
            'task8.demo.onboarding.selected.v1',
            'task8.demo.onboarding.v1',
          ])
            storage?.removeItem(key);
        } catch {
          /* Dev reset still clears in-memory scopes when storage is blocked. */
        }
      }
      return activeDataset.workspaceId;
    },
  };
}

export function createMockApi(options: MockApiOptions = {}) {
  return createMockClient(options).api;
}
