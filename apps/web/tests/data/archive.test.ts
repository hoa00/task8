import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceId } from '@studio/contracts/source-identities';
import { EntityIdSchema, InstantSchema, TaskSchema } from '@studio/contracts/api';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { readArchive } from '../../src/data/mock/archive.ts';
import { runProjectOperation } from '../../src/data/mock/projects.ts';
import { loadArchive } from '../../src/features/archive/loadArchive.ts';
import { StudioApiError, StudioTransportError } from '../../src/data/errors.ts';
const workspaceId = sourceId('workspaces', 'w1'), taskId = sourceId('tasks', 't3');
const code = (value: string) => (error: unknown) => error instanceof StudioApiError && error.detail.code === value;
test('Archive excludes deleted/private/foreign/missing parents; task rows hide archived parents, project counts include archived children', async () => {
  const data = createSeedDataset(), task = data.tasks[taskId]!;
  for (const row of Object.values(data.tasks)) row.archivedAt = fixtureClock.now();
  data.taskCommands.deletedTasks[taskId] = fixtureClock.now();
  const p2 = data.projects[sourceId('projects', 'p2')]!; p2.archivedAt = fixtureClock.now();
  const rows = await readArchive(data, { kind: 'tasks', limit: 200 }, fixtureClock);
  assert.ok(rows.items.length); for (const row of rows.items) { assert.equal(row.kind, 'tasks'); if (row.kind === 'tasks') { assert.notEqual(row.task.id, task.id); assert.notEqual(row.task.projectId, p2.id); assert.notEqual(row.task.projectId, sourceId('projects', 'p6')); } }
  const projects = await readArchive(data, { kind: 'projects', limit: 200 }, fixtureClock), item = projects.items.find(row => row.kind === 'projects' && row.project.project.id === p2.id)!;
  assert.ok(item.kind === 'projects' && item.project.access === 'allowed'); assert.equal(item.project.summary.taskSummary.total, Object.values(data.tasks).filter(row => row.projectId === p2.id).length);
  const before = rows.total; task.projectId = EntityIdSchema.parse('0199c87f-6a80-7001-8000-000000000001'); delete data.taskCommands.deletedTasks[task.id]; assert.equal((await readArchive(data, { kind: 'tasks' }, fixtureClock)).total, before);
});
test('Archive consumes more than200 canonical identities, scoped stable cursor survives restoring anchor and rejects kind/principal/query mismatch', async () => {
  const data = createSeedDataset(), template = data.tasks[taskId]!; data.tasks = {};
  for (let index = 0; index < 205; index++) { const id = EntityIdSchema.parse(`0199c87f-6a80-7001-8000-${index.toString(16).padStart(12, '0')}`); data.tasks[id] = TaskSchema.parse({ ...template, id, archivedAt: fixtureClock.now(), key: `WEB-${500 + index}` }); }
  const first = await readArchive(data, { kind: 'tasks', limit: 200 }, fixtureClock); assert.equal(first.total, 205); assert.equal(first.items.length, 200); assert.ok(first.nextCursor);
  const anchor = first.items.at(-1)!; assert.ok(anchor.kind === 'tasks'); data.tasks[anchor.task.id]!.archivedAt = null;
  const last = await readArchive(data, { kind: 'tasks', limit: 200, cursor: first.nextCursor }, fixtureClock); assert.equal(last.items.length, 5);
  await assert.rejects(readArchive(data, { kind: 'projects', cursor: first.nextCursor }, fixtureClock), code('VALIDATION_ERROR')); await assert.rejects(readArchive(data, { kind: 'tasks', q: 'different', cursor: first.nextCursor }, fixtureClock), code('VALIDATION_ERROR'));
  data.currentMemberId = sourceId('members', 'm2'); await assert.rejects(readArchive(data, { kind: 'tasks', cursor: first.nextCursor }, fixtureClock), code('VALIDATION_ERROR'));
});
test('Project archive follows entity insertion order after creation and sidebar reorder, rather than archive-time or personal sidebar order', async () => {
  const data = createSeedDataset(), ids = Object.keys(data.projects).map(id => EntityIdSchema.parse(id)); for (const id of ids.slice(0, 2)) data.projects[id]!.archivedAt = id === ids[0] ? InstantSchema.parse('2026-10-01T09:00:00.000Z') : fixtureClock.now();
  const created = await runProjectOperation('createProject', { body: { name: 'Last-created archive', leadId: data.currentMemberId, icon: 'folder', color: '#5A67D8', templateId: 'blank' } }, data, fixtureClock) as { data: { project: { id: string; version: number } } };
  await runProjectOperation('archiveProject', { projectId: created.data.project.id, body: { expectedVersion: created.data.project.version } }, data, fixtureClock); data.projectOrder.reverse(); data.projectCommands.orders[data.currentMemberId] = [EntityIdSchema.parse(created.data.project.id), ...data.projectOrder];
  const rows = await readArchive(data, { kind: 'projects', limit: 1 }, fixtureClock), next = await readArchive(data, { kind: 'projects', limit: 200, cursor: rows.nextCursor }, fixtureClock); assert.deepEqual([...rows.items, ...next.items].map(row => row.kind === 'projects' ? row.project.project.id : ''), Object.values(data.projects).filter(row => row.archivedAt && row.visibility !== 'private').map(row => row.id));
});
test('Restore keeps same task ID/children; archived delete is a tombstone with Source purge no UI Undo; contract Undo and conflict remain bounded', async () => {
  const client = createMockClient(), seed = createSeedDataset(), original = (await client.api.getTask({ workspaceId, taskId })).data, task = original.task;
  const archived = (await client.api.archiveTask({ workspaceId, taskId, body: { expectedVersion: task.version } })).data;
  assert.ok((await loadArchive(client, workspaceId, 'tasks')).some(row => row.kind === 'tasks' && row.task.id === taskId));
  const restored = (await client.api.restoreTask({ workspaceId, taskId, body: { expectedVersion: archived.task.version } })).data; assert.equal(restored.task.id, taskId); assert.equal(restored.undo, null); assert.equal(restored.task.archivedAt, null); assert.equal(restored.task.title, seed.tasks[taskId]!.title);
  await assert.rejects(client.api.restoreTask({ workspaceId, taskId, body: { expectedVersion: archived.task.version } }), code('CONFLICT')); await assert.rejects(client.api.undoCommand({ workspaceId, undoId: archived.undo!.id, body: {} }), code('CONFLICT'));
  const second = (await client.api.archiveTask({ workspaceId, taskId, body: { expectedVersion: restored.task.version } })).data, deleted = (await client.api.deleteTask({ workspaceId, taskId, body: { expectedVersion: second.task.version } })).data;
  assert.ok(!(await loadArchive(client, workspaceId, 'tasks')).some(row => row.kind === 'tasks' && row.task.id === taskId)); await assert.rejects(client.api.getTask({ workspaceId, taskId }), code('NOT_FOUND'));
  const undo = await client.api.undoCommand({ workspaceId, undoId: deleted.undo!.id, body: {} }); assert.deepEqual(await client.api.undoCommand({ workspaceId, undoId: deleted.undo!.id, body: {} }), undo); const detail = (await client.api.getTask({ workspaceId, taskId })).data; assert.equal(detail.task.archivedAt, second.task.archivedAt); assert.equal(detail.attachments.length, 0); await client.api.restoreTask({ workspaceId, taskId, body: { expectedVersion: detail.task.version } }); const visible = (await client.api.getTask({ workspaceId, taskId })).data; assert.deepEqual(visible.attachments.map(row => row.id), original.attachments.map(row => row.id)); assert.deepEqual(visible.subtasks.map(row => row.id), Object.values(seed.subtasks).filter(row => row.taskId === taskId).map(row => row.id));
});
test('Actual offline mutations and failed storage preserve entities; retry restores once and project error remains atomic', async () => {
  const rows = new Map<string, string>(); let failStorage = false; const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { if (failStorage) throw Error('disk full'); rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
  const client = createMockClient({ storage, environment: 'test' }), task = (await client.api.getTask({ workspaceId, taskId })).data.task; client.setDemoOffline(true);
  await assert.rejects(client.api.archiveTask({ workspaceId, taskId, body: { expectedVersion: task.version } }), error => error instanceof StudioTransportError && error.kind === 'offline'); assert.deepEqual((await client.api.getTask({ workspaceId, taskId })).data.task, task); client.setDemoOffline(false);
  const archived = (await client.api.archiveTask({ workspaceId, taskId, body: { expectedVersion: task.version } })).data.task; failStorage = true; const bytes = [...rows.entries()];
  await assert.rejects(client.api.restoreTask({ workspaceId, taskId, body: { expectedVersion: archived.version } }), code('INTERNAL_ERROR')); assert.deepEqual((await client.api.getTask({ workspaceId, taskId })).data.task, archived); assert.deepEqual([...rows.entries()], bytes);
  const projectId = sourceId('projects', 'p1'), project = (await client.api.getProject({ workspaceId, projectId })).data; await assert.rejects(client.api.archiveProject({ workspaceId, projectId, body: { expectedVersion: project.version } }), code('INTERNAL_ERROR')); assert.deepEqual((await client.api.getProject({ workspaceId, projectId })).data, project);
  failStorage = false; const restored = (await client.api.restoreTask({ workspaceId, taskId, body: { expectedVersion: archived.version } })).data.task; assert.equal(restored.version, archived.version + 1); assert.equal(restored.id, taskId);
});
