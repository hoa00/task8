import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { BootstrapSchema, CapabilitiesSchema, EntityIdSchema, operations } from '@studio/contracts/api';
import { sourceIdentities, sourceTaskInventory, sourceId } from '@studio/contracts/source-identities';
import { createFixedClock } from '@studio/domain';
import { createMockApi, createMockClient, foundationReads } from '../../src/data/adapters/mock.ts';
import { createHttpApi, createHttpClient } from '../../src/data/adapters/http.ts';
import { StudioApiError, StudioTransportError } from '../../src/data/errors.ts';
import { assertDatasetRelations, MockDatasetSchema } from '../../src/data/mock/dataset.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { loadMockDataset, mockStorageKey, persistMockDataset } from '../../src/data/mock/persistence.ts';
import { mockScenarios } from '../../src/data/mock/scenarios.ts';
import { resetMockState } from '../../src/data/mock/reset.ts';
import { operationQueryKey, queryKeys } from '../../src/data/query-keys.ts';
import { cancelWorkspaceQueries, invalidateOperation, invalidationKeys } from '../../src/data/invalidation.ts';
import { createStudioQueryClient, studioQueryOptions } from '../../src/data/queries.ts';

const workspaceId = sourceId('workspaces', 'w1');
const otherWorkspaceId = sourceId('workspaces', 'w2');
function memoryStorage() {
  const records = new Map<string, string>();
  return { records, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
}
const isApiError = (code: string) => (error: unknown) => error instanceof StudioApiError && error.detail.code === code;

test('normalized seed preserves all canonical identities, task content and relationships', () => {
  const data = createSeedDataset();
  MockDatasetSchema.parse(data);
  assertDatasetRelations(data);
  assert.equal(sourceIdentities.length, 156);
  assert.deepEqual(Object.values(data.tasks).map(({ id, key, title, projectId, assigneeId, status, priority, labelIds, dependencyIds }) => ({ id, key, title, projectId, assigneeId, status, priority, labelIds, dependencyIds })), sourceTaskInventory.map(task => ({ id: task.id, key: task.key, title: task.title, projectId: task.projectId, assigneeId: task.assigneeId, status: task.status, priority: task.priority, labelIds: task.labelIds, dependencyIds: task.dependencyIds })));
  assert.deepEqual([Object.keys(data.members).length, Object.keys(data.projects).length, Object.keys(data.tasks).length, Object.keys(data.comments).length, Object.keys(data.files).length, Object.keys(data.subtasks).length], [8, 7, 49, 9, 12, 16]);
  for (const rows of [data.users, data.workspaces, data.members, data.teams, data.projects, data.tasks, data.subtasks, data.comments, data.files, data.activity, data.notifications, data.events, data.savedViews]) for (const row of Object.values(rows)) EntityIdSchema.parse(row.id);
  const task = data.tasks[sourceId('tasks', 't3')]!;
  assert.equal(task.attachmentCount, 2);
  assert.equal(Object.values(data.files).filter(file => file.taskId === task.id).length, 2);
  assert.equal(data.comments[sourceId('comments', 'c2')]!.mentionedMemberIds[0], data.currentMemberId);
  assert.equal(task.dueDate, '2026-10-09');
  const allMappedIds = [data.users, data.workspaces, data.members, data.teams, data.projects, data.tasks, data.subtasks, data.comments, data.files, data.activity, data.notifications, data.events, data.savedViews].flatMap(rows => Object.values(rows).map(row => row.id));
  allMappedIds.push(...Object.values(data.projects).flatMap(project => project.milestones.map(milestone => milestone.id)));
  assert.deepEqual(allMappedIds.sort(), sourceIdentities.map(row => row.id).sort());
  assert.equal(data.tasks[sourceId('tasks', 't15')]!.recurrence, 'weekly');
  assert.match(task.descriptionHtml, /Low-fidelity wireframes/);
});

test('clock seam is UTC, stable and does not mutate the locked fixture', () => {
  assert.equal(fixtureClock.today(), '2026-10-08');
  assert.equal(createFixedClock('2026-01-01T00:00:00Z').today(), '2026-01-01');
  assert.throws(() => createFixedClock('invalid'));
  assert.deepEqual(createSeedDataset(), createSeedDataset());
});

test('all foundation responses parse and private project catalog excludes protected details', async () => {
  const api = createMockApi();
  for (const id of foundationReads) {
    const input = ['getSession', 'listWorkspaces', 'getProfile'].includes(id) ? {} : { workspaceId };
    operations[id].response.parse(await api[id](input as never));
  }
  const { data } = await api.getBootstrap({ workspaceId });
  BootstrapSchema.parse(data);
  assert.equal(data.unreadCount, 6);
  assert.equal(data.catalogs.taskStatuses.length, 5);
  assert.equal(data.projects.length, 7);
  const privateProject = data.projects.find(item => item.project.id === sourceId('projects', 'p6'))!;
  assert.equal(privateProject.access, 'restricted');
  assert(!('memberIds' in privateProject.project));
  assert(!('summary' in privateProject));
  assert(!JSON.stringify(privateProject).includes('dependencyIds'));
});

test('same 83-method StudioApi and truthful capabilities reject unimplemented mock mutations', async () => {
  const mock = createMockApi();
  const http = createHttpApi({ fetch: async () => { throw new Error('unreachable'); } });
  assert.deepEqual(Object.keys(mock), Object.keys(operations));
  assert.deepEqual(Object.keys(http), Object.keys(mock));
  const { data } = await mock.getSession({});
  CapabilitiesSchema.parse(data.capabilities);
  assert.equal(data.capabilities.dataMode, 'mock');
  assert.equal(data.capabilities.features.tasks, 'unavailable');
  assert.equal(data.capabilities.features.authentication, 'demoOnly');
  await assert.rejects(mock.updateTask({ workspaceId, taskId: sourceId('tasks', 't3'), body: { expectedVersion: 1, title: 'Edit' } }), isApiError('CAPABILITY_UNAVAILABLE'));
});

test('input validation and unavailable workspace fail through contract errors', async () => {
  const api = createMockApi();
  await assert.rejects(api.getBootstrap({ workspaceId: 'p1' }), isApiError('VALIDATION_ERROR'));
  await assert.rejects(api.getBootstrap({ workspaceId: otherWorkspaceId }), isApiError('NOT_FOUND'));
});

test('mock persistence, reload and reset are reproducible and namespace-isolated', async () => {
  const storage = memoryStorage();
  storage.setItem('gr8r.v2', 'source-do-not-touch');
  storage.setItem('task8.ui.theme.v1', 'ui-do-not-touch');
  const client = createMockClient({ storage, environment: 'test' });
  const original = await client.api.getBootstrap({ workspaceId });
  const changed = createSeedDataset();
  changed.projects[sourceId('projects', 'p1')]!.name = 'Persisted fixture edit';
  assert(persistMockDataset(storage, changed));
  const reloaded = createMockClient({ storage, environment: 'test' });
  assert.equal((await reloaded.api.getBootstrap({ workspaceId })).data.projects[0]!.project.name, 'Persisted fixture edit');
  reloaded.reset();
  assert.deepEqual(await reloaded.api.getBootstrap({ workspaceId }), original);
  assert.deepEqual(await createMockClient({ storage, environment: 'test' }).api.getBootstrap({ workspaceId }), original);
  assert.equal(storage.getItem('gr8r.v2'), 'source-do-not-touch');
  assert.equal(storage.getItem('task8.ui.theme.v1'), 'ui-do-not-touch');
  assert.equal(storage.records.size, 3);
});

test('production reset is forbidden; corrupt and foreign persisted state cannot enter mock reads', () => {
  assert.throws(() => createMockClient().reset(), isApiError('FORBIDDEN'));
  const storage = memoryStorage();
  storage.setItem(mockStorageKey(workspaceId), '{broken');
  assert.equal(loadMockDataset(storage, workspaceId), null);
  const data = createSeedDataset();
  const record = { schemaVersion: 1, fixtureSha256: 'wrong', dataset: data };
  storage.setItem(mockStorageKey(workspaceId), JSON.stringify(record));
  assert.equal(loadMockDataset(storage, workspaceId), null);
  data.tasks[sourceId('tasks', 't1')]!.assigneeId = otherWorkspaceId;
  assert.equal(persistMockDataset(storage, data), false);
});

test('blocked storage stays operational in memory without changing other namespaces', async () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  const client = createMockClient({ storage, environment: 'test' });
  const first = await client.api.getSession({});
  client.reset();
  assert.deepEqual(await client.api.getSession({}), first);
});

test('empty, error and offline scenarios produce explicit data states without persistence leaks', async () => {
  assert.deepEqual(Object.keys(mockScenarios), ['populated', 'empty', 'loading', 'error', 'offline']);
  const storage = memoryStorage();
  const empty = createMockApi({ scenario: 'empty', storage });
  assert.equal((await empty.getBootstrap({ workspaceId })).data.projects.length, 0);
  assert.equal((await empty.getBootstrap({ workspaceId })).data.unreadCount, 0);
  await assert.rejects(createMockApi({ scenario: 'error' }).getSession({}), isApiError('INTERNAL_ERROR'));
  await assert.rejects(createMockApi({ scenario: 'offline' }).getSession({}), error => error instanceof StudioTransportError && error.kind === 'offline');
  assert.equal(storage.records.size, 0);
});

test('loading exposes real pending Query state then resolves; cancellation clears the timer', async () => {
  let release: (() => void) | undefined;
  const client = createMockClient({ scenario: 'loading', wait: (milliseconds) => { assert.equal(milliseconds, 1200); return new Promise(resolve => { release = resolve; }); } });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pending = cache.fetchQuery(studioQueryOptions(client, 'getBootstrap', { workspaceId }));
  assert.equal(cache.getQueryState(queryKeys.bootstrap(workspaceId))?.status, 'pending');
  assert.equal(cache.getQueryState(queryKeys.bootstrap(workspaceId))?.fetchStatus, 'fetching');
  release!();
  await pending;
  assert.equal(cache.getQueryState(queryKeys.bootstrap(workspaceId))?.status, 'success');
  cache.clear();
  const controller = new AbortController();
  const cancelled = createMockClient({ scenario: 'loading' }).execute('getSession', {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
});

test('HTTP uses typed JSON responses and advertises HTTP mode only from HTTP session', async () => {
  const mockSession = await createMockApi().getSession({});
  mockSession.data.capabilities.dataMode = 'http';
  for (const feature of ['workspaceProvisioning', 'invitations', 'projectSharing', 'authentication', 'accountSecurity', 'billing'] as const) mockSession.data.capabilities.features[feature] = 'unavailable';
  const calls: [string, RequestInit | undefined][] = [];
  const api = createHttpApi({ baseUrl: '/api/test', fetch: async (url, init) => { calls.push([String(url), init]); return Response.json(mockSession); } });
  const session = await api.getSession({});
  assert.equal(session.data.capabilities.dataMode, 'http');
  assert.equal(calls[0]![0], '/api/test/session');
  assert.equal(calls[0]![1]?.credentials, 'same-origin');
});

test('HTTP errors, network failures and malformed success never fall back to mock', async () => {
  for (const [status, code] of [[404, 'NOT_FOUND'], [501, 'CAPABILITY_UNAVAILABLE'], [500, 'INTERNAL_ERROR']] as const) {
    let count = 0;
    const api = createHttpApi({ fetch: async () => { count++; return Response.json({ error: { code, message: 'Server failure' } }, { status }); } });
    await assert.rejects(api.getBootstrap({ workspaceId }), error => isApiError(code)(error) && error instanceof StudioApiError && error.status === status);
    assert.equal(count, 1);
  }
  await assert.rejects(createHttpApi({ fetch: async () => { throw new TypeError('offline'); } }).getSession({}), error => error instanceof StudioTransportError && error.kind === 'network');
  await assert.rejects(createHttpApi({ fetch: async () => Response.json({ data: {} }) }).getSession({}), error => error instanceof StudioTransportError && error.kind === 'invalidResponse');
  await assert.rejects(createHttpApi({ fetch: async () => new Response(null, { status: 204 }) }).getSession({}), error => error instanceof StudioTransportError && error.kind === 'invalidResponse');
  const mislabeled = await createMockApi().getSession({});
  await assert.rejects(createHttpApi({ fetch: async () => Response.json(mislabeled) }).getSession({}), error => error instanceof StudioTransportError && error.kind === 'invalidResponse');
});

test('HTTP normalizes validated filters with URLSearchParams and forwards abort signals', async () => {
  const controller = new AbortController();
  let url = '';
  const client = createHttpClient({ fetch: async (input, init) => { url = String(input); assert.equal(init?.signal, controller.signal); return Response.json({ data: { items: [], nextCursor: null, total: 0 } }); } });
  await client.execute('listTasks', { workspaceId, query: { filters: [{ field: 'priority', op: 'is', values: ['high'] }] } }, { signal: controller.signal });
  const params = new URL(url, 'https://local.test').searchParams;
  assert.deepEqual(JSON.parse(params.get('filters')!), [{ field: 'priority', op: 'is', values: ['high'] }]);
  assert.equal(params.get('limit'), '50');
  const invalid = createHttpApi({ fetch: async () => { throw new Error('must not fetch'); } });
  await assert.rejects(invalid.getBootstrap({ workspaceId: 'bad' }), isApiError('VALIDATION_ERROR'));
});

test('query keys canonicalize schema defaults and isolate every workspace read', () => {
  const key = operationQueryKey('listTasks', { workspaceId, query: {  } });
  assert.deepEqual(key, queryKeys.tasks(workspaceId, { limit: 50 }));
  assert.notDeepEqual(key, operationQueryKey('listTasks', { workspaceId: otherWorkspaceId, query: {  } }));
  assert.deepEqual(operationQueryKey('getBootstrap', { workspaceId }), queryKeys.bootstrap(workspaceId));
  for (const [id, operation] of Object.entries(operations)) if (operation.method === 'GET' && operation.path.includes('{workspaceId}')) assert.match(operation.path, /workspaces\/\{workspaceId\}/, id);
});

test('mutation invalidation stays in its workspace and includes cross-view task projections', async () => {
  const cache = createStudioQueryClient();
  const keys = ['tasks', 'home', 'bootstrap', 'activity', 'search'].map(name => [...queryKeys.workspace(workspaceId), name]);
  for (const key of keys) cache.setQueryData(key, 'cached');
  const otherKey = [...queryKeys.workspace(otherWorkspaceId), 'tasks'];
  cache.setQueryData(otherKey, 'other');
  const input = { workspaceId, taskId: sourceId('tasks', 't3'), body: { expectedVersion: 1, title: 'Edit' } };
  const invalidated = invalidationKeys('updateTask', input);
  assert(invalidated.every(key => key[1] === workspaceId));
  await invalidateOperation(cache, 'updateTask', input);
  for (const key of keys) assert.equal(cache.getQueryState(key)?.isInvalidated, true);
  assert.equal(cache.getQueryState(otherKey)?.isInvalidated, false);
  cache.clear();
});

test('workspace query cancellation prevents a late old-workspace response entering cache', async () => {
  let signal: AbortSignal | undefined;
  let release: (() => void) | undefined;
  const client = createMockClient({ wait: (_, value) => { signal = value; return new Promise(resolve => { release = resolve; }); } });
  const cache = createStudioQueryClient();
  const pending = cache.fetchQuery(studioQueryOptions(client, 'getBootstrap', { workspaceId }));
  const rejected = assert.rejects(pending);
  await cancelWorkspaceQueries(cache, workspaceId);
  assert.equal(signal?.aborted, true);
  release!();
  await rejected;
  assert.equal(cache.getQueryData(queryKeys.bootstrap(workspaceId)), undefined);
  cache.clear();
});

test('dev/test mock reset clears Query cache while production denial leaves cache untouched', async () => {
  const cache = createStudioQueryClient();
  cache.setQueryData(queryKeys.bootstrap(workspaceId), 'stale');
  await assert.rejects(resetMockState(createMockClient(), cache), isApiError('FORBIDDEN'));
  assert.equal(cache.getQueryData(queryKeys.bootstrap(workspaceId)), 'stale');
  await resetMockState(createMockClient({ environment: 'test' }), cache);
  assert.equal(cache.getQueryCache().getAll().length, 0);
});
