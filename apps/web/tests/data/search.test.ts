import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceId } from '@studio/contracts/source-identities';
import { SearchQuerySchema, TaskSchema } from '@studio/contracts/api';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { readSearch } from '../../src/data/mock/search.ts';
import { persistMockDataset } from '../../src/data/mock/persistence.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import { matchesActivity } from '../../src/features/activity/format.ts';
const workspaceId = sourceId('workspaces', 'w1'), projectId = sourceId('projects', 'p1');
const query = (q: string, category = 'all', limit = 200, cursor?: string) => SearchQuerySchema.parse({ q, category, limit, ...(cursor ? { cursor } : {}) });
test('global literal normalized search has five typed categories and full totals before category/page', async () => {
 const data = createSeedDataset();
 const all = await readSearch(data, query('  WEBSITE  ', 'all', 1), fixtureClock), complete = await readSearch(data, query('website'), fixtureClock);
 assert.ok(all.nextCursor); assert.equal(all.items.length, 1); assert.deepEqual(all.totals, complete.totals); assert.equal(all.total, complete.total); assert.ok(all.total > 1);
 for (const category of ['tasks', 'projects', 'people', 'files', 'comments']) { const result = await readSearch(data, query('website', category, 1), fixtureClock); assert.deepEqual(result.totals, all.totals); assert.equal(result.total, all.totals[category as keyof typeof all.totals]); assert.ok(result.items.every(row => row.kind === category)); }
 for (const text of ['%', '_', '<script>', '   ']) assert.equal((await readSearch(data, query(text), fixtureClock)).total, 0);
});
test('descriptions use canonical normalized text; title/key/member/email/file/comment participate', async () => {
 const data = createSeedDataset(), task = Object.values(data.tasks).find(row => row.projectId === projectId)!;
 data.taskCommands.descriptionTexts[task.id] = 'distinct-description-needle';
 assert.equal((await readSearch(data, query('distinct-description-needle'), fixtureClock)).items[0]?.kind, 'tasks');
 for (const [q, category] of [[task.key, 'tasks'], [data.members[data.currentMemberId]!.email, 'people'], [Object.values(data.files)[0]!.name, 'files'], [Object.values(data.comments)[0]!.bodyText, 'comments']]) assert.ok((await readSearch(data, query(q!, category!), fixtureClock)).total > 0);
});
test('private/missing/archived/deleted/cross-workspace/mismatched parents never leak children', async () => {
 const data = createSeedDataset(), privateId = sourceId('projects', 'p6'), task = Object.values(data.tasks).find(row => row.projectId === projectId)!;
 const file = Object.values(data.files).find(row => row.projectId === projectId)!, comment = Object.values(data.comments).find(row => row.taskId === task.id) ?? Object.values(data.comments)[0]!;
 task.title = 'privacy-needle'; file.name = 'privacy-needle'; file.taskId = task.id; comment.bodyText = 'privacy-needle'; comment.taskId = task.id;
 let result = await readSearch(data, query('privacy-needle'), fixtureClock); assert.equal(result.totals.tasks, 1); assert.equal(result.totals.files, 1); assert.equal(result.totals.comments, 1);
 task.projectId = privateId; result = await readSearch(data, query('privacy-needle'), fixtureClock); assert.equal(result.total, 0);
 task.projectId = projectId; task.archivedAt = fixtureClock.now(); assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).total, 0); task.archivedAt = null;
 data.taskCommands.deletedTasks[task.id] = fixtureClock.now(); assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).total, 0); delete data.taskCommands.deletedTasks[task.id];
 data.projects[projectId]!.archivedAt = fixtureClock.now(); assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).total, 0); data.projects[projectId]!.archivedAt = null;
 data.projectCommands.deletedProjects[projectId] = fixtureClock.now(); assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).total, 0); delete data.projectCommands.deletedProjects[projectId];
 file.projectId = privateId; assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).totals.files, 0); file.projectId = projectId;
 const missing = sourceId('workspaces', 'w2'); file.taskId = missing; comment.taskId = missing; assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).total, 1);
 file.taskId = task.id; comment.taskId = task.id; file.workspaceId = missing; comment.workspaceId = missing; task.workspaceId = missing; assert.equal((await readSearch(data, query('privacy-needle'), fixtureClock)).total, 0);
});
test('deleted comments/files omitted; member scope enforced; >200 complete pages without source30 cap', async () => {
 const data = createSeedDataset(), base = Object.values(data.tasks).find(row => row.projectId === projectId)!;
 for (let n = 1; n <= 225; n++) { const task = TaskSchema.parse({ ...base, id: `019a6257-0480-7000-8000-${(980000 + n).toString().padStart(12, '0')}`, key: `WEB-${1000 + n}`, title: `Pagination needle ${n}`, dependencyIds: [], position: 1000 + n }); data.tasks[task.id] = task; }
 const first = await readSearch(data, query('Pagination needle', 'tasks', 200), fixtureClock), last = await readSearch(data, query('Pagination needle', 'tasks', 200, first.nextCursor!), fixtureClock);
 assert.equal(first.total, 225); assert.equal(first.items.length, 200); assert.equal(last.items.length, 25); assert.equal(last.nextCursor, null); assert.equal(new Set([...first.items, ...last.items].map(row => row.kind === 'tasks' ? row.task.id : '')).size, 225);
 await assert.rejects(readSearch(data, query('different', 'tasks', 200, first.nextCursor!), fixtureClock), error => error instanceof StudioApiError && error.detail.code === 'VALIDATION_ERROR');
 await assert.rejects(readSearch(data, query('Pagination needle', 'all', 200, first.nextCursor!), fixtureClock));
 const file = Object.values(data.files)[0]!, comment = Object.values(data.comments)[0]!; data.taskCommands.deletedFiles[file.id] = fixtureClock.now(); data.taskCommands.deletedComments[comment.id] = fixtureClock.now(); assert.equal((await readSearch(data, query(file.name, 'files'), fixtureClock)).total, 0); assert.equal((await readSearch(data, query(comment.bodyText, 'comments'), fixtureClock)).total, 0);
});
test('mock operation is typed and cancels both before and after wait; errors are not successful empty search', async () => {
 const client = createMockClient(); assert.ok((await client.api.search({ workspaceId, query: query('website') })).data.total > 0);
 const controller = new AbortController(); controller.abort(); await assert.rejects(client.execute('search', { workspaceId, query: query('website') }, { signal: controller.signal }), error => error instanceof Error && error.name === 'AbortError');
 const slow = createMockClient({ scenario: 'loading' }), next = new AbortController(), request = slow.execute('search', { workspaceId, query: query('website') }, { signal: next.signal }); next.abort(); await assert.rejects(request, error => error instanceof Error && error.name === 'AbortError');
 await assert.rejects(createMockClient({ scenario: 'error' }).api.search({ workspaceId, query: query('website') }), error => error instanceof StudioApiError && error.detail.code === 'INTERNAL_ERROR');
 await assert.rejects(client.api.search({ workspaceId: sourceId('workspaces', 'w2'), query: query('website') }), error => error instanceof StudioApiError && error.detail.code === 'NOT_FOUND');
});
test('activity authorizes nullable/mismatched canonical task parents and keeps archived task history', async () => {
 const data = createSeedDataset(), base = Object.values(data.activity).find(row => row.taskId)!, task = data.tasks[base.taskId!]!, project = data.projects[task.projectId]!;
 base.projectId = null; const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
 const read = async () => { persistMockDataset(storage, data); return (await createMockClient({ storage }).api.listActivity({ workspaceId, query: { limit: 200 } })).data; };
 assert.ok((await read()).items.some(row => row.id === base.id)); task.archivedAt = fixtureClock.now(); assert.ok((await read()).items.some(row => row.id === base.id));
 project.visibility = 'private'; project.memberIds = []; assert.ok(!(await read()).items.some(row => row.id === base.id)); project.visibility = 'workspace';
 data.taskCommands.deletedTasks[task.id] = fixtureClock.now(); assert.ok(!(await read()).items.some(row => row.id === base.id));
});
test('real rename/date updates stay outside Status changes while completion/reopen remain in the filter', async () => {
 const client = createMockClient(), task = (await client.api.listTasks({ workspaceId, query: { limit: 200 } })).data.items.find(row => row.status !== 'done')!;
 const renamed = (await client.api.updateTask({ workspaceId, taskId: task.id, body: { expectedVersion: task.version, title: 'Status filter rename boundary' } })).data.task;
 const renamedFeed = (await client.api.listActivity({ workspaceId, query: { taskId: task.id, limit: 200 } })).data.items;
 const update = renamedFeed.find(row => row.eventType === 'task.updated')!; assert.equal(update.payload.status, update.payload.previousStatus); assert.equal(matchesActivity(update, 'status'), false);
 const completed = (await client.api.setTaskCompletion({ workspaceId, taskId: task.id, body: { expectedVersion: renamed.version, completed: true } })).data.task;
 await client.api.setTaskCompletion({ workspaceId, taskId: task.id, body: { expectedVersion: completed.version, completed: false } });
 const feed = (await client.api.listActivity({ workspaceId, query: { taskId: task.id, limit: 200 } })).data.items;
 assert.ok(feed.some(row => row.eventType === 'task.completed' && matchesActivity(row, 'status'))); assert.ok(feed.some(row => row.eventType === 'task.updated' && row.payload.status !== row.payload.previousStatus && matchesActivity(row, 'status')));
});
