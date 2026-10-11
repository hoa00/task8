import assert from 'node:assert/strict';
import test from 'node:test';
import { MemberPreferencesSchema, UpdatePreferencesInputSchema } from '../../packages/contracts/src/api.ts';
import { sourceId } from '../../packages/contracts/src/source-identities.ts';
import { createMockClient } from '../../apps/web/src/data/adapters/mock.ts';
import { createSeedDataset } from '../../apps/web/src/data/mock/seed.ts';
import { mockStorageKey } from '../../apps/web/src/data/mock/persistence.ts';
import { readLanguage, normalizeLanguage } from '../../apps/web/src/i18n/locale.ts';
import { i18n, setLanguage, translate } from '../../apps/web/src/i18n/i18n.ts';
const workspaceId = sourceId('workspaces', 'w1');
function memory() {
  const values = new Map();
  return { values, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
}
test('Vietnamese is the fresh default, only vi/en can be written, and both selections survive saved mock reloads', async () => {
  const { storage } = memory(), client = createMockClient({ storage });
  assert.equal((await client.api.getPreferences({ workspaceId })).data.lang, 'vi');
  for (const lang of ['en', 'vi']) {
    const before = (await client.api.getPreferences({ workspaceId })).data;
    await client.api.updatePreferences({ workspaceId, body: { lang } });
    assert.deepEqual((await createMockClient({ storage }).api.getPreferences({ workspaceId })).data, { ...before, lang });
  }
  for (const lang of ['fr', 'Deutsch', 'English (US)', '', null]) assert.equal(UpdatePreferencesInputSchema.safeParse({ lang }).success, false);
  assert.equal(UpdatePreferencesInputSchema.parse({ theme: 'dark' }).lang, undefined);
});
test('Legacy language preferences migrate without discarding tasks, profile, other preferences or persisted workspace data', async () => {
  const { storage, values } = memory(), client = createMockClient({ storage });
  const tasks = await client.api.listTasks({ workspaceId, query: { limit: 200 } });
  await client.api.updatePreferences({ workspaceId, body: { density: 'compact', lang: 'en' } });
  const key = mockStorageKey(workspaceId), record = JSON.parse(values.get(key));
  record.dataset.preferences.lang = 'English (UK)'; storage.setItem(key, JSON.stringify(record));
  const reload = createMockClient({ storage });
  assert.equal((await reload.api.getPreferences({ workspaceId })).data.lang, 'en');
  assert.equal((await reload.api.getPreferences({ workspaceId })).data.density, 'compact');
  assert.deepEqual(await reload.api.listTasks({ workspaceId, query: { limit: 200 } }), tasks);
  const preferences = createSeedDataset().preferences;
  for (const lang of ['Deutsch', 'Español', 'Français', '日本語', undefined]) assert.equal(MemberPreferencesSchema.parse({ ...preferences, lang }).lang, 'vi');
});
test('A failed save leaves the canonical language and workspace data unchanged', async () => {
  const { storage } = memory(), client = createMockClient({ storage });
  const before = await client.api.getBootstrap({ workspaceId });
  storage.setItem = () => { throw Error('Storage denied'); };
  await assert.rejects(client.api.updatePreferences({ workspaceId, body: { lang: 'en' } }));
  assert.deepEqual(await client.api.getBootstrap({ workspaceId }), before);
});
test('Translations react to language changes, interpolate literal user text, and use proper English plurals', async () => {
  const title = '<img src=x onerror=alert(1)> Settings';
  await setLanguage('vi');
  assert.equal(i18n.resolvedLanguage, 'vi');
  assert.equal(translate('Language'), 'Ngôn ngữ');
  assert.equal(translate('Created {{name}}', { name: title }), `Đã tạo ${title}`);
  assert.equal(translate('Delete {{count}} task?', { count: 2 }), 'Xóa 2 công việc?');
  await setLanguage('en');
  assert.equal(translate('Language'), 'Language');
  assert.equal(translate('Delete {{count}} task?', { count: 1 }), 'Delete 1 task?');
  assert.equal(translate('Delete {{count}} task?', { count: 2 }), 'Delete 2 tasks?');
  await setLanguage('vi');
});
test('Unknown or inaccessible browser preferences keep Vietnamese as default', () => {
  assert.equal(readLanguage(), 'vi');
  assert.equal(normalizeLanguage('fr'), 'vi');
  assert.equal(normalizeLanguage('English (US)'), 'en');
});

test('System activity wording localizes catalog values and keeps assignee names literal', async () => {
  const { activityDetail } = await import('../../apps/web/src/features/activity/format.ts');
  await setLanguage('vi');
  assert.equal(activityDetail({ eventType: 'task.moved', payload: { detail: 'to Review' } }), 'sang Chờ duyệt');
  assert.equal(activityDetail({ eventType: 'task.assigned', payload: { detail: 'to Settings' } }), 'cho Settings');
  assert.equal(activityDetail({ eventType: 'comment.created', payload: { detail: 'Settings' } }), 'Settings');
});

test('Generated notification text localizes but comment snippets and entity names remain literal', async () => {
  const { notificationText, notificationSnippet } = await import('../../apps/web/src/features/notifications/notification-language.ts');
  await setLanguage('vi');
  assert.equal(notificationSnippet({ type: 'assign', snippet: 'Due in 6 days' }), 'Đến hạn sau 6 ngày');
  assert.equal(notificationSnippet({ type: 'comment', snippet: 'Settings' }), 'Settings');
  assert.equal(notificationSnippet({ type: 'mention', snippet: 'Due in 6 days' }), 'Due in 6 days');
  assert.equal(notificationSnippet({ type: 'update', text: 'completed', snippet: 'Settings' }), 'Settings');
  assert.equal(notificationText({ type: 'update', projectId: 'project', text: 'Settings is at risk' }, { projects: [{ project: { id: 'project', name: 'Settings' } }] }), 'Settings đang có rủi ro');
  assert.equal(notificationText({ type: 'update', text: 'moved to Review' }, { projects: [] }), 'đã chuyển sang Chờ duyệt');
});
