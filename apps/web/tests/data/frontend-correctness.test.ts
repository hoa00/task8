import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { EntityIdSchema, operations } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset } from '../../src/data/mock/seed.ts';
import { persistMockDataset, mockStorageKey } from '../../src/data/mock/persistence.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import { invalidationKeys, operationInvalidations } from '../../src/data/invalidation.ts';
const workspaceId = sourceId('workspaces', 'w1');
const projectId = sourceId('projects', 'p1');
const notificationId = sourceId('notifs', 'n1');
const code = (value: string) => (error: unknown) =>
  error instanceof StudioApiError && error.detail.code === value;
function memory() {
  const rows = new Map<string, string>();
  let fail = false;
  return {
    rows,
    setFailure: (value: boolean) => {
      fail = value;
    },
    storage: {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (fail) throw Error('Storage unavailable');
        rows.set(key, value);
      },
      removeItem: (key: string) => {
        rows.delete(key);
      },
    },
  };
}
for (const action of ['read', 'unread', 'readAll'] as const)
  test(`notification ${action} shares pending create transaction and persists both effects`, async () => {
    const { storage } = memory();
    const client = createMockClient({ storage });
    if (action === 'unread')
      await client.api.updateNotification({ workspaceId, notificationId, body: { read: true } });
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let held = false;
    const stub = mock.method(
      crypto.subtle,
      'digest',
      async (...args: Parameters<typeof digest>) => {
        if (!held) {
          held = true;
          enter();
          await hold;
        }
        return digest(...args);
      },
    );
    try {
      const task = client.api.createTask({
        workspaceId,
        body: { projectId, title: `Held ${action}`, clientRequestId: crypto.randomUUID() },
      });
      await entered;
      const notification =
        action === 'readAll'
          ? client.api.readAllNotifications({ workspaceId })
          : client.api.updateNotification({
              workspaceId,
              notificationId,
              body: { read: action === 'read' },
            });
      await new Promise((resolve) => setImmediate(resolve));
      release();
      const [created] = await Promise.all([task, notification]);
      const reload = createMockClient({ storage });
      assert.equal(
        (await reload.api.getTask({ workspaceId, taskId: created.data.task.id })).data.task.title,
        `Held ${action}`,
      );
      const feed = (await reload.api.listNotifications({ workspaceId, query: {} })).data;
      assert.equal(
        !!feed.items.find((row) => row.id === notificationId)!.readAt,
        action !== 'unread',
      );
      assert.equal(
        (await reload.api.getBootstrap({ workspaceId })).data.unreadCount,
        feed.unreadCount,
      );
      if (action === 'readAll') assert.equal(feed.unreadCount, 0);
    } finally {
      release();
      stub.mock.restore();
    }
  });

test('rejected persistence/handler commits nothing and the next command drains the queue', async () => {
  const mem = memory();
  const client = createMockClient({ storage: mem.storage });
  const before = mem.rows.get(mockStorageKey(workspaceId));
  mem.setFailure(true);
  await assert.rejects(
    client.api.updateNotification({ workspaceId, notificationId, body: { read: true } }),
    code('INTERNAL_ERROR'),
  );
  await assert.rejects(
    client.api.createTask({
      workspaceId,
      body: { projectId, title: 'Must not commit', clientRequestId: crypto.randomUUID() },
    }),
    code('INTERNAL_ERROR'),
  );
  assert.equal(mem.rows.get(mockStorageKey(workspaceId)), before);
  assert.equal(
    (await client.api.listNotifications({ workspaceId, query: {} })).data.items.find(
      (row) => row.id === notificationId,
    )!.readAt,
    null,
  );
  assert.equal(
    (await client.api.listTasks({ workspaceId, query: { q: 'Must not commit' } })).data.total,
    0,
  );
  mem.setFailure(false);
  await assert.rejects(
    client.api.updateTask({
      workspaceId,
      taskId: sourceId('tasks', 't3'),
      body: { expectedVersion: 999, title: 'Rejected' },
    }),
    code('CONFLICT'),
  );
  await client.api.updateNotification({ workspaceId, notificationId, body: { read: true } });
  assert.ok(
    (
      await createMockClient({ storage: mem.storage }).api.listNotifications({
        workspaceId,
        query: {},
      })
    ).data.items.find((row) => row.id === notificationId)!.readAt,
  );
});

test('Unicode task/member/project sort and file anchors traverse >200 rows without loss or duplication', async () => {
  const data = createSeedDataset(),
    mem = memory();
  const original = data.tasks[sourceId('tasks', 't3')]!,
    file = Object.values(data.files).find((row) => row.projectId === projectId)!;
  data.projects[projectId]!.name = 'Dự án 日本語 🎉';
  if (original.assigneeId) data.members[original.assigneeId]!.name = 'Nguyễn 日本語 🎉';
  for (let index = 0; index < 205; index++) {
    const id = EntityIdSchema.parse(
      `019a6257-0480-7000-8000-${String(550000 + index).padStart(12, '0')}`,
    );
    data.tasks[id] = {
      ...original,
      id,
      title: `Tiếng Việt 日本語 🎉 ${index}`,
      key: `WEB-${5000 + index}`,
    };
    data.files[id] = { ...file, id, name: `Tiếng Việt 日本語 🎉 ${index}.txt`, taskId: null };
  }
  assert.equal(persistMockDataset(mem.storage, data), true);
  const client = createMockClient({ storage: mem.storage });
  for (const sortField of ['title', 'assignee', 'project'] as const) {
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const page = (
        await client.api.listTasks({
          workspaceId,
          query: { q: 'Tiếng Việt', sortField, limit: 200, ...(cursor ? { cursor } : {}) },
        })
      ).data;
      ids.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(ids.length, 205);
    assert.equal(new Set(ids).size, 205);
  }
  const first = (
    await client.api.listProjectFiles({
      workspaceId,
      projectId,
      query: { q: 'Tiếng Việt', sort: 'name', limit: 200 },
    })
  ).data;
  const last = (
    await client.api.listProjectFiles({
      workspaceId,
      projectId,
      query: { q: 'Tiếng Việt', sort: 'name', cursor: first.nextCursor!, limit: 200 },
    })
  ).data;
  assert.equal(new Set([...first.items, ...last.items].map((row) => row.id)).size, 205);
  assert.equal(last.nextCursor, null);
});

test('task cursors reject principal, operation, query and malformed shape mismatches', async () => {
  const data = createSeedDataset(),
    mem = memory();
  persistMockDataset(mem.storage, data);
  const client = createMockClient({ storage: mem.storage });
  const cursor = (await client.api.listTasks({ workspaceId, query: { limit: 1 } })).data
    .nextCursor!;
  await assert.rejects(
    client.api.listTasks({ workspaceId, query: { q: 'other', cursor } }),
    code('VALIDATION_ERROR'),
  );
  await assert.rejects(
    client.api.listActivity({ workspaceId, query: { cursor } }),
    code('VALIDATION_ERROR'),
  );
  for (const invalid of ['a', 'e30', 'x'.repeat(2049)])
    await assert.rejects(
      client.api.listTasks({ workspaceId, query: { cursor: invalid } }),
      code('VALIDATION_ERROR'),
    );
  data.currentMemberId = sourceId('members', 'm2');
  persistMockDataset(mem.storage, data);
  await assert.rejects(
    createMockClient({ storage: mem.storage }).api.listTasks({ workspaceId, query: { cursor } }),
    code('VALIDATION_ERROR'),
  );
});

test('lifecycle/move/Undo invalidation covers notification visibility with exhaustive write mapping', () => {
  for (const id of [
    'deleteTask',
    'archiveTask',
    'restoreTask',
    'restoreDeletedTask',
    'bulkMutateTasks',
    'moveTask',
    'deleteProject',
    'restoreDeletedProject',
    'updateProject',
    'undoCommand',
  ] as const)
    assert.ok(operationInvalidations[id]?.includes('notifications'), id);
  for (const [id, op] of Object.entries(operations))
    if (op.method !== 'GET' && op.path.includes('{workspaceId}'))
      assert.ok(id in operationInvalidations, id);
  const keys = invalidationKeys('deleteTask', {
    workspaceId,
    taskId: sourceId('tasks', 't3'),
    body: { expectedVersion: 1 },
  });
  assert.ok(keys.some((key) => key[2] === 'notifications'));
  assert.ok(keys.every((key) => key[1] === workspaceId));
});

test('feed and bootstrap refetch together after delete/Undo without invalidating a foreign workspace', async () => {
  const { createStudioQueryClient, studioQueryOptions } = await import('../../src/data/queries.ts');
  const { invalidateOperation } = await import('../../src/data/invalidation.ts');
  const { operationQueryKey } = await import('../../src/data/query-keys.ts');
  const client = createMockClient(),
    cache = createStudioQueryClient();
  const feedInput = { workspaceId, query: {} },
    bootInput = { workspaceId };
  const before = (
    await cache.fetchQuery(studioQueryOptions(client, 'listNotifications', feedInput))
  ).data.items;
  const notification = before.find((row) => row.taskId && row.id === notificationId)!;
  const detail = (await client.api.getTask({ workspaceId, taskId: notification.taskId! })).data;
  await cache.fetchQuery(studioQueryOptions(client, 'getBootstrap', bootInput));
  const foreign = ['workspace', sourceId('workspaces', 'w2'), 'notifications'];
  cache.setQueryData(foreign, 'foreign');
  const input = {
    workspaceId,
    taskId: detail.task.id,
    body: { expectedVersion: detail.task.version },
  };
  const deleted = (await client.api.deleteTask(input)).data;
  await invalidateOperation(cache, 'deleteTask', input);
  assert.equal(
    cache.getQueryState(operationQueryKey('listNotifications', feedInput))?.isInvalidated,
    true,
  );
  const feed = await cache.fetchQuery(studioQueryOptions(client, 'listNotifications', feedInput));
  const bootstrap = await cache.fetchQuery(studioQueryOptions(client, 'getBootstrap', bootInput));
  assert.ok(!feed.data.items.some((row) => row.id === notification.id));
  assert.equal(bootstrap.data.unreadCount, feed.data.unreadCount);
  assert.equal(cache.getQueryState(foreign)?.isInvalidated, false);
  const undoInput = { workspaceId, undoId: deleted.undo!.id, body: {} };
  await client.api.undoCommand(undoInput);
  await invalidateOperation(cache, 'undoCommand', undoInput);
  assert.ok(
    (await cache.fetchQuery(studioQueryOptions(client, 'listNotifications', feedInput))).data.items.some(
      (row) => row.id === notification.id,
    ),
  );
  cache.clear();
});
