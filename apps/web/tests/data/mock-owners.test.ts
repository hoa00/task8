import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { sourceId } from '@studio/contracts/source-identities';
import { normalizeTaskQuery, normalizeTaskEvaluation } from '@studio/domain';
import {
  taskOperationHandlers,
  taskOperationIds,
  runTaskOperation,
} from '../../src/data/mock/operation-registry.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { defaultOnboardingDraft, onboardingFlowId } from '../../src/data/onboarding-demo.ts';

test('task query semantics normalize without any column metadata and reject presentation fields as query', () => {
  const query = normalizeTaskQuery({
    filters: [{ field: 'status', op: 'is', values: ['todo', 'todo'] }],
  });
  assert.deepEqual(query.filters[0]?.values, ['todo']);
  assert.throws(() => normalizeTaskQuery({ hiddenColumns: ['start'] }));
  assert.deepEqual(
    Object.keys(normalizeTaskEvaluation({ query: { q: '日本語' }, groupBy: 'project' })).sort(),
    ['groupBy', 'query'],
  );
  assert.equal(normalizeTaskEvaluation().groupBy, 'status');
});
test('every declared mock task operation has a handler and an unsupported command leaves the aggregate unchanged', async () => {
  assert.deepEqual(Object.keys(taskOperationHandlers).sort(), [...taskOperationIds].sort());
  const data = createSeedDataset(),
    before = structuredClone(data);
  await assert.rejects(
    runTaskOperation('authLogin', {}, data, fixtureClock),
    /Unsupported mock operation/,
  );
  assert.deepEqual(data, before);
  await runTaskOperation('getTask', { taskId: sourceId('tasks', 't3') }, data, fixtureClock);
});
test('canonical profile synchronization queues behind a workspace task transaction without losing either projection', async () => {
  const client = createMockClient();
  const draft = {
    ...defaultOnboardingDraft(onboardingFlowId()),
    ws: 'Queue scope',
    url: 'queue-scope',
    proj: 'Queue project',
    completedStep: 4,
  };
  const scope = await client.completeOnboarding(draft);
  const profile = (await client.api.getProfile({})).data;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
      entered = r;
    }),
    hold = new Promise<void>((r) => {
      release = r;
    });
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let held = false;
  const stub = mock.method(crypto.subtle, 'digest', async (...args: Parameters<typeof digest>) => {
    if (!held) {
      held = true;
      entered();
      await hold;
    }
    return digest(...args);
  });
  try {
    const task = client.api.createTask({
      workspaceId: scope.workspaceId,
      body: {
        projectId: scope.projectId!,
        title: 'Queued task',
        clientRequestId: crypto.randomUUID(),
      },
    });
    await started;
    const updated = client.api.updateProfile({
      body: { expectedVersion: profile.version, name: 'New canonical name' },
    });
    await new Promise((r) => setImmediate(r));
    release();
    await Promise.all([task, updated]);
    const boot = (await client.api.getBootstrap({ workspaceId: scope.workspaceId })).data;
    assert.equal(boot.currentMember.name, 'New canonical name');
    assert.equal(
      (await client.api.listTasks({ workspaceId: scope.workspaceId, query: { q: 'Queued task' } }))
        .data.total,
      1,
    );
  } finally {
    release();
    stub.mock.restore();
  }
});
