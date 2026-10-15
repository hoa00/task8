import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceId } from '@studio/contracts/source-identities';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { runTaskOperation } from '../../src/data/mock/operation-registry.ts';
import { StudioApiError } from '../../src/data/errors.ts';
const workspaceId = sourceId('workspaces', 'w1'), projectId = sourceId('projects', 'p1'), taskId = sourceId('tasks', 't3');
const errorCode = (code: string) => (error: unknown) => error instanceof StudioApiError && error.detail.code === code;
test('inline create IDs/key sequence, request replay, title edit and atomic invalid relation', async () => {
 const client = createMockClient(), body = { clientRequestId: crypto.randomUUID(), projectId, title: 'Inline list task' };
 const created = (await client.api.createTask({ workspaceId, body })).data.task; assert.match(created.id, /^[a-f0-9]{8}-[a-f0-9]{4}-7/); assert.equal(created.key, 'WEB-201');
 assert.equal((await client.api.createTask({ workspaceId, body })).data.task.id, created.id);
 await assert.rejects(client.api.createTask({ workspaceId, body: { ...body, title: 'Different' } }), errorCode('CONFLICT'));
 const edited = (await client.api.updateTask({ workspaceId, taskId: created.id, body: { expectedVersion: created.version, title: 'Changed inline title' } })).data.task; assert.equal(edited.title, 'Changed inline title'); assert.equal(edited.version, 2);
 await assert.rejects(client.api.updateTask({ workspaceId, taskId: created.id, body: { expectedVersion: 1, title: 'Stale' } }), errorCode('CONFLICT')); assert.equal((await client.api.getTask({ workspaceId, taskId: created.id })).data.task.title, edited.title);
 const creates = await Promise.all([1, 2].map(n => client.api.createTask({ workspaceId, body: { ...body, clientRequestId: crypto.randomUUID(), title: `Concurrent${n}` } }))); assert.equal(new Set(creates.map(result => result.data.task.key)).size, 2);
});
test('bulk patch all targets CAS, ordinary status recurrence no Undo, stale zero effects', async () => {
 const client = createMockClient(), rows = (await client.api.listTasks({ workspaceId, query: { projectId, limit: 200 } })).data.items.slice(0, 2); const items = rows.map(row => ({ id: row.id, expectedVersion: row.version }));
 const before = await client.api.getTaskSummary({ workspaceId, query: {} });
 await assert.rejects(client.api.bulkMutateTasks({ workspaceId, body: { operation: 'patch', items: [{ ...items[0]!, expectedVersion: 99 }, items[1]!], patch: { priority: 'urgent' } } }), errorCode('CONFLICT'));
 assert.deepEqual(await client.api.getTaskSummary({ workspaceId, query: {} }), before); assert.deepEqual((await client.api.getTask({ workspaceId, taskId: rows[1]!.id })).data.task, rows[1]);
 const result = await client.api.bulkMutateTasks({ workspaceId, body: { operation: 'patch', items, patch: { status: 'done', assigneeId: null, priority: 'high' } } }); assert.equal(result.data.undo, null); result.data.tasks.forEach(row => { assert.equal(row.status, 'done'); assert.equal(row.assigneeId, null); assert.equal(row.priority, 'high'); });
});
test('retained Delete tombstones: hide reads/counts, preserve children/history, atomic Undo/replay/stale guard', async () => {
 const data = createSeedDataset(), rows = Object.values(data.tasks).filter(row => row.projectId === projectId).slice(0, 2), items = rows.map(row => ({ id: row.id, expectedVersion: row.version }));
 const retained = { subtasks: structuredClone(data.subtasks), comments: structuredClone(data.comments), files: structuredClone(data.files) };
 const deleted = await runTaskOperation('bulkMutateTasks', { body: { operation: 'delete', items } }, data, fixtureClock) as { data: { undo: { id: string }; tasks: typeof rows } };
 assert.equal(Object.keys(data.taskCommands.deletedTasks).length, 2); assert.deepEqual(data.subtasks, retained.subtasks); assert.deepEqual(data.comments, retained.comments); assert.deepEqual(data.files, retained.files); assert.equal('deletedAt' in deleted.data.tasks[0]!, false);
 await assert.rejects(runTaskOperation('getTask', { taskId: rows[0]!.id }, data, fixtureClock), errorCode('NOT_FOUND'));
 const snapshot = structuredClone(data); data.tasks[rows[1]!.id]!.version++; const stale = structuredClone(data);
 await assert.rejects(runTaskOperation('undoCommand', { undoId: deleted.data.undo.id }, data, fixtureClock), errorCode('CONFLICT')); assert.deepEqual(data, stale);
 Object.assign(data, snapshot); const result = await runTaskOperation('undoCommand', { undoId: deleted.data.undo.id }, data, fixtureClock); assert.equal(Object.keys(data.taskCommands.deletedTasks).length, 0); assert.equal(data.tasks[rows[0]!.id]!.version, rows[0]!.version + 2);
 const versions = rows.map(row => data.tasks[row.id]!.version); assert.deepEqual(await runTaskOperation('undoCommand', { undoId: deleted.data.undo.id }, data, fixtureClock), result); assert.deepEqual(rows.map(row => data.tasks[row.id]!.version), versions);
 assert.deepEqual(data.subtasks, retained.subtasks); assert.equal(Object.values(data.activity).filter(row => row.eventType === 'task.deleted').length, 0);
});
test('subtask done aggregate increments parent and rejects stale/cross parent without writes', async () => {
 const client = createMockClient(); const detail = (await client.api.getTask({ workspaceId, taskId })).data; const subtask = detail.subtasks[0]!;
 const changed = (await client.api.updateSubtask({ workspaceId, taskId, subtaskId: subtask.id, body: { expectedTaskVersion: detail.task.version, done: !subtask.done } })).data; assert.equal(changed.task.version, detail.task.version + 1); assert.equal(changed.task.subtaskSummary.completed, changed.subtasks.filter(row => row.done).length);
 await assert.rejects(client.api.updateSubtask({ workspaceId, taskId, subtaskId: subtask.id, body: { expectedTaskVersion: detail.task.version, done: subtask.done } }), errorCode('CONFLICT'));
 assert.deepEqual((await client.api.getTask({ workspaceId, taskId })).data, changed);
});
test('deleted dependency targets reject explicit replacement; retained associations project out, scalar edit preserves, removal guards Undo', async () => {
 const data = createSeedDataset(), a = data.tasks[taskId]!, b = Object.values(data.tasks).find(row => row.projectId === a.projectId && row.id !== a.id && row.dependencyIds.length === 0)!;
 data.tasks[b.id] = { ...b, dependencyIds: [a.id] };
 const result = await runTaskOperation('bulkMutateTasks', { body: { operation: 'delete', items: [{ id: a.id, expectedVersion: a.version }] } }, data, fixtureClock) as { data: { undo: { id: string } } };
 await assert.rejects(runTaskOperation('getTask', { taskId: a.id }, data, fixtureClock), errorCode('NOT_FOUND'));
 const before = structuredClone(data);
 await assert.rejects(runTaskOperation('updateTask', { taskId: b.id, body: { expectedVersion: b.version, dependencyIds: [a.id] } }, data, fixtureClock), errorCode('VALIDATION_ERROR')); assert.deepEqual(data, before);
 await runTaskOperation('updateTask', { taskId: b.id, body: { expectedVersion: b.version, title: 'Scalar while retained' } }, data, fixtureClock); assert.deepEqual(data.tasks[b.id]!.dependencyIds, [a.id]);
 const detail = await runTaskOperation('getTask', { taskId: b.id }, data, fixtureClock) as { data: { task: { dependencyIds: string[] } } }; assert.deepEqual(detail.data.task.dependencyIds, []);
 const subtask=Object.values(data.subtasks)[0]!;data.subtasks[subtask.id]={...subtask,taskId:b.id};
 const aggregate=await runTaskOperation('updateSubtask',{taskId:b.id,subtaskId:subtask.id,body:{expectedTaskVersion:data.tasks[b.id]!.version,done:!subtask.done}},data,fixtureClock) as typeof detail;assert.deepEqual(aggregate.data.task.dependencyIds,[]);assert.deepEqual(data.tasks[b.id]!.dependencyIds,[a.id]);
 const noop=await runTaskOperation('setTaskCompletion',{taskId:b.id,body:{expectedVersion:data.tasks[b.id]!.version,completed:data.tasks[b.id]!.status==='done'}},data,fixtureClock) as typeof detail;assert.deepEqual(noop.data.task.dependencyIds,[]);
 await runTaskOperation('updateTask', { taskId: b.id, body: { expectedVersion: data.tasks[b.id]!.version, dependencyIds: [] } }, data, fixtureClock); assert.equal(data.tasks[a.id]!.version, a.version + 2);
 const stale = structuredClone(data); await assert.rejects(runTaskOperation('undoCommand', { undoId: result.data.undo.id }, data, fixtureClock), errorCode('CONFLICT')); assert.deepEqual(data, stale);
});
test('create request dedupe is actor scoped and bulk recurrence preserves every incoming target version bump', async () => {
 const data = createSeedDataset(), request = { clientRequestId: crypto.randomUUID(), projectId, title: 'Actor scoped' };
 const a = await runTaskOperation('createTask', { body: request }, data, fixtureClock) as { data: { task: { id: string } } };
 data.currentMemberId = Object.values(data.members).find(member => member.id !== data.currentMemberId)!.id;
 const b = await runTaskOperation('createTask', { body: request }, data, fixtureClock) as typeof a; assert.notEqual(a.data.task.id,b.data.task.id);
 const parents = Object.values(data.tasks).filter(row=>row.projectId===projectId && row.status!=='done' && !row.dependencyIds.length).slice(0,2), recurring = parents[0]!, target=parents[1]!;
 data.tasks[recurring.id]={...recurring,recurrence:'weekly',dueDate:fixtureClock.today(),startDate:null,dependencyIds:[target.id]};
 const versions = [data.tasks[recurring.id]!.version,target.version];
 await runTaskOperation('bulkMutateTasks',{body:{operation:'patch',items:parents.map(row=>({id:row.id,expectedVersion:row.version})),patch:{status:'done'}}},data,fixtureClock);
 assert.equal(data.tasks[recurring.id]!.version,versions[0]!+1);assert.equal(data.tasks[target.id]!.version,versions[1]!+2);
});

test('bulk over the POC limit returns canonical413 with zero task/count writes', async () => {
 const client=createMockClient(), before=(await client.api.listTasks({workspaceId,query:{limit:200}})).data, summary=await client.api.getTaskSummary({workspaceId,query:{}});assert.ok(before.items.length>20);
 await assert.rejects(client.api.bulkMutateTasks({workspaceId,body:{operation:'delete',items:before.items.slice(0,21).map(task=>({id:task.id,expectedVersion:task.version}))}}),error=>error instanceof StudioApiError&&error.status===413&&error.detail.code==='PAYLOAD_TOO_LARGE');
 assert.deepEqual((await client.api.listTasks({workspaceId,query:{limit:200}})).data,before);assert.deepEqual(await client.api.getTaskSummary({workspaceId,query:{}}),summary);
});
