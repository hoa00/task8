import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationQuerySchema, NotificationSchema } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { mockStorageKey, persistMockDataset } from '../../src/data/mock/persistence.ts';
import { readBootstrap } from '../../src/data/mock/reads.ts';
import { runNotificationOperation, visibleNotifications } from '../../src/data/mock/notifications.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import { invalidationKeys } from '../../src/data/invalidation.ts';
const workspaceId = sourceId('workspaces', 'w1');
const query = (input: unknown = {}) => NotificationQuerySchema.parse(input);
function memoryStorage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; }

test('one notification table supplies Source categories and distinct Inbox/Notifications badges', async () => {
  const client = createMockClient(), all = (await client.api.listNotifications({ workspaceId, query: {} })).data, bootstrap = (await client.api.getBootstrap({ workspaceId })).data;
  assert.equal(all.total, 10); assert.equal(all.unreadCount, 6); assert.equal(bootstrap.unreadCount, 6); assert.equal(bootstrap.navigationCounts.inbox, 4);
  assert.deepEqual(all.items.map(row => row.createdAt), all.items.map(row => row.createdAt).sort().reverse());
  for (const category of ['mention', 'assign', 'comment', 'update'] as const) {
    const filtered = (await client.api.listNotifications({ workspaceId, query: { category, unreadOnly: true } })).data;
    assert.equal(filtered.unreadCount, 6); assert.ok(filtered.items.every(row => row.type === category && !row.readAt));
  }
});
test('read/unread/read-all persist across reload; idempotent reads preserve server readAt; no foreign state touched', async () => {
  const storage = memoryStorage(), data = createSeedDataset(), foreign = { ...Object.values(data.notifications)[0]!, id: sourceId('workspaces', 'w2'), recipientId: sourceId('members', 'm2') };
  data.notifications[foreign.id] = foreign; persistMockDataset(storage, data);
  let client = createMockClient({ storage }); const id = sourceId('notifs', 'n1');
  const read = (await client.api.updateNotification({ workspaceId, notificationId: id, body: { read: true } })).data;
  assert.equal(read.readAt, fixtureClock.now()); assert.equal((await client.api.updateNotification({ workspaceId, notificationId: id, body: { read: true } })).data.readAt, read.readAt);
  client = createMockClient({ storage }); assert.equal((await client.api.getBootstrap({ workspaceId })).data.unreadCount, 5); assert.equal((await client.api.getBootstrap({ workspaceId })).data.navigationCounts.inbox, 3);
  await client.api.updateNotification({ workspaceId, notificationId: id, body: { read: false } });
  assert.deepEqual((await client.api.readAllNotifications({ workspaceId })).data, { changedCount: 6, unreadCount: 0 });
  assert.deepEqual((await client.api.readAllNotifications({ workspaceId })).data, { changedCount: 0, unreadCount: 0 });
  client = createMockClient({ storage }); const all = (await client.api.listNotifications({ workspaceId, query: {} })).data;
  assert.equal(all.unreadCount, 0); assert.ok(all.items.every(row => row.readAt)); assert.equal((await client.api.getBootstrap({ workspaceId })).data.navigationCounts.inbox, 0);
  await assert.rejects(client.api.updateNotification({ workspaceId, notificationId: foreign.id, body: { read: true } }), error => error instanceof StudioApiError && error.detail.code === 'NOT_FOUND');
});
test('private/missing/deleted/cross-workspace/mismatched parents and other recipients are excluded from every count', () => {
  const data = createSeedDataset(), row = data.notifications[sourceId('notifs', 'n1')]!, task = data.tasks[row.taskId!]!, project = data.projects[task.projectId]!;
  const check = () => { const visible = visibleNotifications(data); assert.ok(!visible.some(item => item.id === row.id)); const bootstrap = readBootstrap(data, fixtureClock); assert.equal(bootstrap.unreadCount, visible.filter(item => !item.readAt).length); assert.equal(bootstrap.navigationCounts.inbox, visible.filter(item => !item.readAt && item.type !== 'update').length); };
  row.recipientId = sourceId('members', 'm2'); check(); row.recipientId = data.currentMemberId;
  row.workspaceId = sourceId('workspaces', 'w2'); check(); row.workspaceId = workspaceId;
  row.projectId = sourceId('projects', 'p6'); check(); row.projectId = task.projectId;
  project.visibility = 'private'; project.memberIds = []; check(); project.visibility = 'workspace';
  data.taskCommands.deletedTasks[task.id] = fixtureClock.now(); check(); delete data.taskCommands.deletedTasks[task.id];
  data.projectCommands.deletedProjects[project.id] = fixtureClock.now(); check(); delete data.projectCommands.deletedProjects[project.id];
  task.workspaceId = sourceId('workspaces', 'w2'); check(); task.workspaceId = workspaceId;
  row.taskId = sourceId('workspaces', 'w3'); check(); row.taskId = task.id;
  // Archived records remain readable history, as with task drawer/activity.
  project.archivedAt = fixtureClock.now(); task.archivedAt = fixtureClock.now(); assert.ok(visibleNotifications(data).some(item => item.id === row.id));
});
test('keyset cursor covers >200 records and remains stable after the anchor is marked read; scope mismatch rejects', () => {
  const data = createSeedDataset(), original = Object.values(data.notifications)[0]!;
  data.notifications = {};
  for (let n = 0; n < 225; n++) { const row = NotificationSchema.parse({ ...original, id: `019a6257-0480-7000-8000-${(981000 + n).toString().padStart(12, '0')}`, readAt: null }); data.notifications[row.id] = row; }
  const first = runNotificationOperation('listNotifications', { query: query({ unreadOnly: true, limit: 200 }) }, data, fixtureClock).data;
  assert.ok('items' in first); if (!('items' in first)) return;
  assert.equal(first.items.length, 200); assert.equal(first.total, 225);
  runNotificationOperation('updateNotification', { notificationId: first.items.at(-1)!.id, body: { read: true } }, data, fixtureClock);
  const last = runNotificationOperation('listNotifications', { query: query({ unreadOnly: true, cursor: first.nextCursor!, limit: 200 }) }, data, fixtureClock).data;
  assert.ok('items' in last); if (!('items' in last)) return;
  assert.equal(last.items.length, 25); assert.equal(new Set([...first.items, ...last.items].map(row => row.id)).size, 225); assert.equal(last.nextCursor, null);
  assert.throws(() => runNotificationOperation('listNotifications', { query: query({ category: 'mention', unreadOnly: true, cursor: first.nextCursor! }) }, data, fixtureClock), error => error instanceof StudioApiError && error.detail.code === 'VALIDATION_ERROR');
});
test('invalid/foreign requests are zero-write; cancellation and error scenarios never return successful empty results', async () => {
  const storage = memoryStorage(), client = createMockClient({ storage }), before = storage.getItem(mockStorageKey(workspaceId));
  await assert.rejects(client.api.updateNotification({ workspaceId, notificationId: sourceId('notifs', 'n1'), body: { read: 'true' as unknown as boolean } }), error => error instanceof StudioApiError && error.detail.code === 'VALIDATION_ERROR');
  await assert.rejects(client.api.readAllNotifications({ workspaceId: sourceId('workspaces', 'w2') })); assert.equal(storage.getItem(mockStorageKey(workspaceId)), before);
  await assert.rejects(createMockClient({ scenario: 'error' }).api.listNotifications({ workspaceId, query: {} }), error => error instanceof StudioApiError && error.detail.code === 'INTERNAL_ERROR');
  const controller = new AbortController(), promise = createMockClient({ scenario: 'loading' }).execute('listNotifications', { workspaceId, query: {} }, { signal: controller.signal }); controller.abort(); await assert.rejects(promise, error => error instanceof Error && error.name === 'AbortError');
});
test('Inbox reply uses existing createComment/listComments task owner and shared task count/mention/reaction operations', async () => {
  const client = createMockClient(), taskId = sourceId('tasks', 't3'), before = (await client.api.getTask({ workspaceId, taskId })).data.task;
  const memberName = createSeedDataset().members[sourceId('members', 'm2')]!.name, text = `Inbox reply @${memberName}`;
  const result = (await client.api.createComment({ workspaceId, taskId, body: { bodyText: text, mentionedMemberIds: [sourceId('members', 'm2')] } })).data;
  const comments = (await client.api.listComments({ workspaceId, taskId, query: {} })).data.items;
  assert.ok(comments.some(row => row.bodyText === text)); assert.equal((await client.api.getTask({ workspaceId, taskId })).data.task.commentCount, before.commentCount + 1);
  await client.api.addCommentReaction({ workspaceId, commentId: result.comment.id, reactionKey: '👍' });
  assert.ok((await client.api.listComments({ workspaceId, taskId, query: {} })).data.items.find(row => row.id === result.comment.id)!.reactions[0]!.memberIds.includes(sourceId('members', 'm1')));
});
test('notification mutations invalidate shared notifications and bootstrap; comments invalidate the same notification owner', () => {
  for (const [id, input] of [['updateNotification', { workspaceId, notificationId: sourceId('notifs', 'n1'), body: { read: true } }], ['readAllNotifications', { workspaceId }]] as const) assert.deepEqual(invalidationKeys(id, input), [['workspace', workspaceId, 'notifications'], ['workspace', workspaceId, 'bootstrap']]);
  const keys = invalidationKeys('createComment', { workspaceId, taskId: sourceId('tasks', 't3'), body: { bodyText: 'Shared reply' } });
  assert.ok(keys.some(key => key[2] === 'notifications')); assert.ok(keys.some(key => key[2] === 'comments')); assert.ok(keys.some(key => key[2] === 'task'));
});
