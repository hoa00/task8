import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivitySchema, EntityIdSchema, TaskSchema } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import { addDateDays, completedInRollingWeek, homeDeadlines, homeTaskTabs } from '@studio/domain';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createEmptyDataset, createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { readDashboardScope, readHome, readOverview } from '../../src/data/mock/dashboards.ts';
import { persistMockDataset } from '../../src/data/mock/persistence.ts';
const workspaceId = sourceId('workspaces', 'w1'), projectId = sourceId('projects', 'p1');
test('full authorized counters, per-project progress and workload agree with canonical summary, not previews', async () => {
 const client = createMockClient(), home = (await client.api.getHome({ workspaceId })).data, overview = (await client.api.getOverview({ workspaceId })).data, summary = (await client.api.getTaskSummary({ workspaceId, query: {} })).data;
 assert.deepEqual(overview.taskSummary, summary); assert.equal(home.counters.totalTasks, summary.total); assert.equal(home.counters.overdue, summary.overdue); assert.equal(home.myTasks.total, home.myTasks.items.length); assert.equal(home.deadlines.total, home.deadlines.items.length); assert.equal(home.projects.total, home.projects.items.length); assert.ok(home.myTasks.total > 7);
 for (const item of overview.projects) if (item.access === 'allowed') { const expected = (await client.api.getProjectSummary({ workspaceId, projectId: item.project.id })).data; assert.deepEqual(item.summary, expected); }
 const page = (await client.api.listTasks({ workspaceId, query: { limit: 1 } })).data; assert.equal(page.items.length, 1); assert.equal(page.total, summary.total); assert.deepEqual((await client.api.getOverview({ workspaceId })).data, overview);
});
test('Home previews/tabs and Overview full totals survive >200 tasks and archived/deleted/private parents', async () => {
 const data = createSeedDataset(), base = Object.values(data.tasks).find(task => task.projectId === projectId)!;
 for (let n = 1; n <= 350; n++) { const task = TaskSchema.parse({ ...base, id: `019a6257-0480-7000-8000-${(900000 + n).toString().padStart(12, '0')}`, key: `WEB-${1000 + n}`, title: `Pagination ${n}`, assigneeId: data.currentMemberId, status: 'todo', completedAt: null, dueDate: fixtureClock.today(), startDate: null, dependencyIds: [], position: 1000 + n }); data.tasks[task.id] = task; }
 const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; persistMockDataset(storage, data); const client = createMockClient({ storage });
 const home = (await client.api.getHome({ workspaceId })).data, overview = (await client.api.getOverview({ workspaceId })).data, page = (await client.api.listTasks({ workspaceId, query: { limit: 200 } })).data;
 assert.equal(page.items.length, 200); assert.ok(page.nextCursor); assert.equal(overview.taskSummary.total, page.total); assert.ok(home.myTasks.total > 350); assert.equal(homeTaskTabs(home.myTasks.items, fixtureClock.today()).upcoming.filter(task => task.title.startsWith('Pagination')).length, 350); assert.equal(homeDeadlines(home.deadlines.items, fixtureClock.today())[0]!.tasks.filter(task => task.title.startsWith('Pagination')).length, 350);
 const privateId = sourceId('projects', 'p6'); assert.ok(!readDashboardScope(data).tasks.some(task => task.projectId === privateId));
 data.projects[projectId]!.archivedAt = fixtureClock.now(); assert.ok(!readDashboardScope(data).tasks.some(task => task.projectId === projectId)); assert.ok(!readOverview(data, fixtureClock).projects.some(item => item.project.id === projectId)); data.projects[projectId]!.archivedAt = null;
 data.projectCommands.deletedProjects[projectId] = fixtureClock.now(); assert.ok(!readDashboardScope(data).tasks.some(task => task.projectId === projectId)); delete data.projectCommands.deletedProjects[projectId];
 data.tasks[base.id]!.archivedAt = fixtureClock.now(); assert.ok(!readDashboardScope(data).tasks.some(task => task.id === base.id)); data.tasks[base.id]!.archivedAt = null; data.taskCommands.deletedTasks[base.id] = fixtureClock.now(); assert.ok(!readDashboardScope(data).tasks.some(task => task.id === base.id));
});
test('elapsed seven-day boundary, completedAt rather than updatedAt, future source predicate and inclusive deadline dates', () => {
 const base = Object.values(createSeedDataset().tasks)[0]!, now = Date.parse(fixtureClock.now()), make = (offset: number) => TaskSchema.parse({ ...base, status: 'done', completedAt: new Date(now - offset).toISOString(), updatedAt: fixtureClock.now() });
 assert.equal(completedInRollingWeek([make(7 * 86400000), make(7 * 86400000 - 1), make(7 * 86400000 + 1), make(-1)], fixtureClock.now()), 2);
 const tasks = [-1, 0, 1, 2, 7, 8].map((days, i) => TaskSchema.parse({ ...base, id: `019a6257-0480-7000-8000-${(910000 + i).toString().padStart(12, '0')}`, status: 'todo', completedAt: null, startDate: null, dueDate: addDateDays(fixtureClock.today(), days) }));
 assert.deepEqual(homeDeadlines(tasks, fixtureClock.today()).map(group => group.tasks.map(task => task.dueDate)), [[fixtureClock.today()], [addDateDays(fixtureClock.today(), 1)], [addDateDays(fixtureClock.today(), 2), addDateDays(fixtureClock.today(), 7)]]);
 assert.equal(homeTaskTabs(tasks, fixtureClock.today()).overdue.length, 1); assert.equal(homeTaskTabs(tasks, fixtureClock.today()).upcoming.length, 5);
});
test('Recent newest seven/total authorize task parent with nullable project; history retains archived task but excludes missing/private/deleted/archived parents', () => {
 const data = createSeedDataset(), template = Object.values(data.activity)[0]!, visible = Object.values(data.tasks).find(task => task.projectId === projectId)!, hidden = Object.values(data.tasks).find(task => task.projectId === sourceId('projects', 'p6'))!;
 const id = EntityIdSchema.parse('019a6257-0480-7000-8000-000000920001'); data.activity = { [id]: ActivitySchema.parse({ ...template, id, projectId: null, taskId: hidden.id, createdAt: fixtureClock.now() }) }; assert.equal(readHome(data, fixtureClock).recentActivity.total, 0);
 data.activity[id] = ActivitySchema.parse({ ...data.activity[id], taskId: visible.id }); assert.equal(readHome(data, fixtureClock).recentActivity.total, 1); data.tasks[visible.id]!.archivedAt = fixtureClock.now(); assert.equal(readHome(data, fixtureClock).recentActivity.total, 1);
 data.projects[projectId]!.archivedAt = fixtureClock.now(); assert.equal(readHome(data, fixtureClock).recentActivity.total, 0); data.projects[projectId]!.archivedAt = null;
 data.projectCommands.deletedProjects[projectId] = fixtureClock.now(); assert.equal(readHome(data, fixtureClock).recentActivity.total, 0); delete data.projectCommands.deletedProjects[projectId];
 data.taskCommands.deletedTasks[visible.id] = fixtureClock.now(); assert.equal(readHome(data, fixtureClock).recentActivity.total, 0); delete data.taskCommands.deletedTasks[visible.id];
 data.tasks[visible.id]!.workspaceId = EntityIdSchema.parse('019a6257-0480-7000-8000-000000920002'); assert.equal(readHome(data, fixtureClock).recentActivity.total, 0); data.tasks[visible.id]!.workspaceId = workspaceId;
 delete data.tasks[visible.id]; assert.equal(readHome(data, fixtureClock).recentActivity.total, 0);
 const populated = readHome(createSeedDataset(), fixtureClock); assert.ok(populated.recentActivity.total > 7); assert.equal(populated.recentActivity.items.length, 7); assert.ok(populated.recentActivity.items.every((row, index, rows) => index === 0 || rows[index - 1]!.createdAt >= row.createdAt));
});
test('real create/reschedule/complete/reopen update Home tabs/deadlines and Overview progress/workload without counters storage', async () => {
 const client = createMockClient(), before = (await client.api.getOverview({ workspaceId })).data, mine = (await client.api.getBootstrap({ workspaceId })).data.currentMember.id;
 let task = (await client.api.createTask({ workspaceId, body: { clientRequestId: crypto.randomUUID(), projectId, title: 'Dashboard journey', assigneeId: mine, dueDate: fixtureClock.today() } })).data.task;
 assert.equal((await client.api.getOverview({ workspaceId })).data.taskSummary.total, before.taskSummary.total + 1); assert.ok((await client.api.getHome({ workspaceId })).data.deadlines.items.some(row => row.id === task.id));
 task = (await client.api.updateTask({ workspaceId, taskId: task.id, body: { expectedVersion: task.version, dueDate: addDateDays(fixtureClock.today(), -1) } })).data.task;
 let home = (await client.api.getHome({ workspaceId })).data; assert.ok(homeTaskTabs(home.myTasks.items, fixtureClock.today()).overdue.some(row => row.id === task.id)); assert.ok(!home.deadlines.items.some(row => row.id === task.id));
 const count = home.counters.completedThisWeek; task = (await client.api.setTaskCompletion({ workspaceId, taskId: task.id, body: { expectedVersion: task.version, completed: true } })).data.task;
 home = (await client.api.getHome({ workspaceId })).data; assert.equal(home.counters.completedThisWeek, count + 1); assert.ok(homeTaskTabs(home.myTasks.items, fixtureClock.today()).completed.some(row => row.id === task.id));
 const completed = (await client.api.getOverview({ workspaceId })).data; assert.equal(completed.taskSummary.completed, before.taskSummary.completed + 1); assert.equal(completed.workload.find(row => row.member.id === mine)!.openTasks, before.workload.find(row => row.member.id === mine)!.openTasks);
 await client.api.setTaskCompletion({ workspaceId, taskId: task.id, body: { expectedVersion: task.version, completed: false } }); assert.equal((await client.api.getHome({ workspaceId })).data.counters.completedThisWeek, count);
});
test('empty aggregate is truthful with zero division and no preview limits', () => {
 const data = createEmptyDataset(), home = readHome(data, fixtureClock), overview = readOverview(data, fixtureClock); assert.equal(home.counters.totalTasks, 0); assert.deepEqual(homeTaskTabs(home.myTasks.items, fixtureClock.today()), { upcoming: [], overdue: [], completed: [] }); assert.ok(homeDeadlines(home.deadlines.items, fixtureClock.today()).every(group => !group.tasks.length)); assert.equal(overview.taskSummary.completionRate, 0); assert.equal(overview.projects.length, 0); assert.equal(overview.milestones.length, 0); assert.ok(overview.workload.every(row => row.openTasks === 0));
});
test('Home task DTOs reuse actor favorites and visible dependency projection from canonical task reads', async () => {
 const data = createSeedDataset(), task = Object.values(data.tasks).find(row => row.assigneeId === data.currentMemberId && row.projectId === projectId)!, dependency = Object.values(data.tasks).find(row => row.projectId === projectId && row.id !== task.id)!;
 task.isFavorite = false; task.dependencyIds = [dependency.id]; data.taskCommands.taskFavorites[data.currentMemberId] = [task.id]; data.taskCommands.deletedTasks[dependency.id] = fixtureClock.now();
 const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; persistMockDataset(storage, data); const client = createMockClient({ storage });
 const projected = (await client.api.getHome({ workspaceId })).data.myTasks.items.find(row => row.id === task.id)!;
 assert.equal(projected.isFavorite, true); assert.deepEqual(projected.dependencyIds, []); assert.deepEqual(projected, (await client.api.getTask({ workspaceId, taskId: task.id })).data.task);
});
