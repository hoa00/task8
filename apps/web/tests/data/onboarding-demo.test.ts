import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboardingDemo, defaultOnboardingDraft, normalizeOnboardingStep, onboardingFlowId, onboardingUnavailable, updateOnboardingDraft } from '../../src/data/onboarding-demo.ts';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset } from '../../src/data/mock/seed.ts';
import { loadMockDataset, mockStorageKey } from '../../src/data/mock/persistence.ts';
import { StudioApiError } from '../../src/data/errors.ts';

function storage() { const rows = new Map<string, string>(); return { rows, getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } }; }
const readyDraft = () => ({ ...defaultOnboardingDraft(onboardingFlowId()), ws: 'New Studio', url: 'new-studio', proj: 'First Project', completedStep: 4 });
test('Direct steps normalize missing prerequisites, including reload and invalid range', () => {
  const draft = defaultOnboardingDraft(onboardingFlowId());
  for (const step of [0, 1, 2, 3, 4, 5, -1, 99, NaN]) assert.equal(normalizeOnboardingStep(step, draft), 0);
  draft.completedStep = 0; assert.equal(normalizeOnboardingStep(5, draft), 1);
  draft.ws = 'Studio'; draft.completedStep = 1; assert.equal(normalizeOnboardingStep(5, draft), 2);
  draft.completedStep = 2; assert.equal(normalizeOnboardingStep(5, draft), 3);
  draft.completedStep = 3; draft.proj = ''; assert.equal(normalizeOnboardingStep(5, draft), 3);
  draft.proj = 'Project'; assert.equal(normalizeOnboardingStep(5, draft), 4);
  draft.completedStep = 4; assert.equal(normalizeOnboardingStep(5, draft), 5);
});
test('Slug and template naming preserve Source touched semantics', () => {
  let draft = defaultOnboardingDraft(onboardingFlowId());
  draft = updateOnboardingDraft(draft, { ws: ' New Studio! ' }); assert.equal(draft.url, 'new-studio');
  draft = updateOnboardingDraft(draft, { url: 'Manual URL' }); assert.equal(draft.url, 'manual-url');
  draft = updateOnboardingDraft(draft, { ws: 'Changed' }); assert.equal(draft.url, 'manual-url');
  draft = updateOnboardingDraft(draft, { tmpl: 'design' }); assert.equal(draft.proj, 'Design Project');
  draft = updateOnboardingDraft(draft, { proj: 'Custom' }); draft = updateOnboardingDraft(draft, { tmpl: 'web' }); assert.equal(draft.proj, 'Custom');
});
test('Draft and receipt persist; double submit/retry/reload complete exactly once', async () => {
  const store = storage(), client = createMockClient({ storage: store }), seed = createSeedDataset(), original = store.getItem(mockStorageKey(seed.workspaceId));
  let calls = 0; const facade = createOnboardingDemo(onboardingFlowId(), async draft => { calls++; return client.completeOnboarding(draft); }, store);
  facade.update(readyDraft()); facade.update({ team: 'table', invites: ['one@example.com', '', ''] });
  const [a, b] = await Promise.all([facade.finish(true), facade.finish(true)]); assert.deepEqual(a, b); assert.equal(calls, 1);
  await facade.finish(true); assert.equal(calls, 2);
  const reloaded = createOnboardingDemo(onboardingFlowId(), draft => client.completeOnboarding(draft), store); assert.deepEqual(await reloaded.finish(true), a);
  assert.equal(reloaded.draft.ws, 'New Studio'); assert.equal(store.getItem(mockStorageKey(seed.workspaceId)), original);
  const dataset = loadMockDataset(store, a.workspaceId)!; assert.equal(Object.keys(dataset.projects).length, 1); assert.equal(Object.keys(dataset.tasks).length, 6); assert.equal(dataset.preferences.defaultTab, 'table'); assert.equal(Object.keys(dataset.members).length, 1);
  assert.ok(Object.values(dataset.tasks).every(task => task.workspaceId === a.workspaceId)); assert.notEqual(dataset.currentMemberId, seed.currentMemberId);
  client.selectWorkspace(a.workspaceId);
  const beforeReload = store.getItem(mockStorageKey(a.workspaceId));
  const freshClient = createMockClient({ storage: store }); assert.equal(store.getItem(mockStorageKey(a.workspaceId)), beforeReload); assert.equal((await freshClient.execute('getSession', {})).data.currentWorkspaceId, a.workspaceId);
  const other = await freshClient.execute('getBootstrap', { workspaceId: seed.workspaceId }); assert.equal(other.data.workspace.name, seed.workspaces[seed.workspaceId]!.name);
  const newScope = await freshClient.execute('getBootstrap', { workspaceId: a.workspaceId }); assert.equal(newScope.data.projects.length, 1); assert.equal(newScope.data.currentMember.id, dataset.currentMemberId);
  await assert.rejects(freshClient.execute('getTask', { workspaceId: a.workspaceId, taskId: Object.keys(seed.tasks)[0]! }));
  await assert.rejects(freshClient.execute('getTask', { workspaceId: seed.workspaceId, taskId: Object.keys(dataset.tasks)[0]! }));
});
test('Port itself serializes same-flow completion across independent facades', async () => {
  const store = storage(), client = createMockClient({ storage: store }), draft = readyDraft();
  const [a, b] = await Promise.all([client.completeOnboarding(draft), client.completeOnboarding(draft)]); assert.deepEqual(a, b);
  assert.equal((await client.execute('listWorkspaces', {})).data.length, 4); assert.equal(Object.keys(loadMockDataset(store, a.workspaceId)!.tasks).length, 6);
});
test('Original onboarding project survives creation, reorder and reload without extra entities', async () => {
  const store = storage(), client = createMockClient({ storage: store }), draft = readyDraft(), original = await client.completeOnboarding(draft);
  const bootstrap = (await client.execute('getBootstrap', { workspaceId: original.workspaceId })).data;
  const later = (await client.execute('createProject', { workspaceId: original.workspaceId, body: { name: 'Later Project', icon: 'folder', color: '#5A67D8', leadId: bootstrap.currentMember.id, teamId: null, templateId: 'blank', dueDate: null } })).data.project;
  await client.execute('updateProjectOrder', { workspaceId: original.workspaceId, body: { projectIds: [original.projectId!, later.id] } });
  const stored = loadMockDataset(store, original.workspaceId)!; stored.projectOrder.reverse(); store.setItem(mockStorageKey(stored.workspaceId), JSON.stringify({ schemaVersion: 1, fixtureSha256: '8e552aa66ea24cd6300c16242769a85548b315b1ca55258d03df76f8bf439a80', dataset: stored }));
  const reloaded = createMockClient({ storage: store }); assert.deepEqual(await reloaded.completeOnboarding(draft), original);
  assert.equal(Object.keys(loadMockDataset(store, original.workspaceId)!.projects).length, 2);
});
test('Receipt storage failure retries existing durable dataset; draft is frozen after finish', async () => {
  const store = storage(), client = createMockClient({ storage: store }), draft = readyDraft(); let fail = false;
  const fragile = { ...store, setItem: (key: string, value: string) => { if (fail && key === 'task8.demo.onboarding.v1') throw Error('Storage full'); store.setItem(key, value); } };
  const facade = createOnboardingDemo(onboardingFlowId(), draft => client.completeOnboarding(draft), fragile); facade.update(draft); fail = true;
  await assert.rejects(facade.finish(true)); const first = loadMockDataset(store, draft.flowId)!; fail = false;
  const result = await facade.finish(true); assert.equal(result.projectId, first.projectOrder[0]);
  facade.update({ ws: 'Changed after finish' }); assert.equal(facade.draft.ws, draft.ws);
});
test('Unavailable completion performs no work, and HTTP explicit demo retains fixed seed context', async () => {
  let calls = 0; const seed = createSeedDataset();
  const facade = createOnboardingDemo(onboardingFlowId(), async () => { calls++; return { workspaceId: seed.workspaceId, projectId: null, mode: 'seed-demo' }; }); facade.update(readyDraft());
  await assert.rejects(facade.finish(false), { message: onboardingUnavailable }); assert.equal(calls, 0);
  assert.deepEqual(await facade.finish(true), { workspaceId: seed.workspaceId, projectId: null, mode: 'seed-demo' }); assert.equal(calls, 1);
});
test('HTTP receipts always revalidate current configured seed; late reads never select a workspace', async () => {
  const store = storage(), seed = createSeedDataset(), client = createMockClient({ storage: store });
  const draft = readyDraft(), result = await client.completeOnboarding(draft); client.selectWorkspace(result.workspaceId);
  await client.execute('getBootstrap', { workspaceId: seed.workspaceId }); assert.equal((await client.execute('getSession', {})).data.currentWorkspaceId, result.workspaceId);
  let configured = seed.workspaceId, reads = 0;
  const facade = createOnboardingDemo(onboardingFlowId(), async () => { reads++; return { workspaceId: configured, projectId: null, mode: 'seed-demo' }; }, store, 'task8.demo.onboarding.http.v1'); facade.update(draft);
  await facade.finish(true); configured = result.workspaceId; const newResult = await facade.finish(true); assert.equal(newResult.workspaceId, configured); assert.equal(reads, 2);
});
test('Edited global principal survives finish and profile changes from either scope', async () => {
  const store = storage(), client = createMockClient({ storage: store }), seed = createSeedDataset();
  const original = (await client.execute('getProfile', {})).data;
  await client.execute('updateProfile', { body: { expectedVersion: original.version, name: 'Updated Principal' } });
  const before = store.getItem(mockStorageKey(seed.workspaceId)), result = await client.completeOnboarding(readyDraft()); assert.equal(store.getItem(mockStorageKey(seed.workspaceId)), before);
  client.selectWorkspace(result.workspaceId); assert.equal((await client.execute('getProfile', {})).data.name, 'Updated Principal');
  const profile = (await client.execute('getProfile', {})).data; await client.execute('updateProfile', { body: { expectedVersion: profile.version, title: 'Global title' } });
  for (const workspaceId of [seed.workspaceId, result.workspaceId]) { client.selectWorkspace(workspaceId); assert.equal((await client.execute('getProfile', {})).data.title, 'Global title'); assert.equal((await client.execute('getBootstrap', { workspaceId })).data.currentMember.title, 'Global title'); }
  const reloaded = createMockClient({ storage: store }); reloaded.selectWorkspace(result.workspaceId); assert.equal((await reloaded.execute('getProfile', {})).data.title, 'Global title');
});
test('Concurrent seed/scoped profile writes share CAS and failed storage preserves both scopes after reload', async () => {
  const store = storage(), seed = createSeedDataset(); let fail = false;
  const fragile = { ...store, setItem: (key: string, value: string) => { if (fail && key === mockStorageKey(seed.workspaceId)) throw Error('Storage full'); store.setItem(key, value); } };
  const client = createMockClient({ storage: fragile }), result = await client.completeOnboarding(readyDraft());
  const profile = (await client.execute('getProfile', {})).data;
  const first = client.execute('updateProfile', { body: { expectedVersion: profile.version, name: 'One authority' } });
  client.selectWorkspace(result.workspaceId);
  const second = client.execute('updateProfile', { body: { expectedVersion: profile.version, name: 'Split authority' } });
  const outcomes = await Promise.allSettled([first, second]); assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(row => row.status === 'rejected'); assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof StudioApiError); assert.equal(rejected.reason.detail.code, 'CONFLICT'); assert.equal(rejected.reason.status, 409);
  for (const workspaceId of [seed.workspaceId, result.workspaceId]) { client.selectWorkspace(workspaceId); assert.equal((await client.execute('getProfile', {})).data.name, 'One authority'); }
  const current = (await client.execute('getProfile', {})).data; fail = true;
  await assert.rejects(client.execute('updateProfile', { body: { expectedVersion: current.version, name: 'Not persisted' } })); fail = false;
  const reloaded = createMockClient({ storage: fragile });
  for (const workspaceId of [seed.workspaceId, result.workspaceId]) { reloaded.selectWorkspace(workspaceId); assert.equal((await reloaded.execute('getProfile', {})).data.name, 'One authority'); assert.equal((await reloaded.execute('getBootstrap', { workspaceId })).data.currentMember.name, 'One authority'); }
});
test('Development reset clears only registered demo scopes and their receipts', async () => {
  const store = storage(), client = createMockClient({ storage: store, environment: 'test' }), result = await client.completeOnboarding(readyDraft()); client.selectWorkspace(result.workspaceId); client.reset();
  assert.equal((await client.execute('getSession', {})).data.currentWorkspaceId, createSeedDataset().workspaceId); await assert.rejects(client.execute('getBootstrap', { workspaceId: result.workspaceId })); assert.equal(loadMockDataset(store, result.workspaceId), null);
});
