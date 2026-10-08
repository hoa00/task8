import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as contracts from '../../packages/contracts/src/index.ts';
import * as f from './fixtures.ts';

const reject = (schema: { safeParse: (input: unknown) => { success: boolean } }, value: unknown) => assert.equal(schema.safeParse(value).success, false);
test('DateOnly accepts actual leap dates and rejects rollover without timezone conversion', () => {
  for (const date of ['2026-02-30', '2026-02-29', '1900-02-29', '2026-04-31', '0000-01-01', '2026-00-01', '2026-13-01', '2026-1-01', '2026-10-08T00:00:00Z']) reject(contracts.DateOnlySchema, date);
  for (const date of ['2024-02-29', '2000-02-29', '2026-10-08', '0001-01-01']) assert.equal(contracts.DateOnlySchema.parse(date), date);
  reject(contracts.InstantSchema, '2026-10-08T09:00:00.000+07:00');
  reject(contracts.InstantSchema, '2026-10-08');
  assert.equal(contracts.InstantSchema.parse(f.instant), f.instant);
  assert.equal(contracts.InstantSchema.parse('2026-10-08T09:00:00Z'), '2026-10-08T09:00:00Z');
});
test('PATCH null clears; absent keeps; explicit undefined is not an update', () => {
  const absent = contracts.UpdateTaskInputSchema.parse({ expectedVersion: 1, title: 'New title' });
  assert.equal(Object.hasOwn(absent, 'assigneeId'), false);
  assert.equal(contracts.UpdateTaskInputSchema.parse({ expectedVersion: 1, assigneeId: null }).assigneeId, null);
  for (const value of [{ expectedVersion: 1 }, { expectedVersion: 1, title: undefined }, { expectedVersion: 1, assigneeId: '' }, { expectedVersion: 1, projectId: f.ids.projectId }, { expectedVersion: 1, version: 4 }, { expectedVersion: 1, key: 'WEB-999' }]) reject(contracts.UpdateTaskInputSchema, value);
  reject(contracts.TaskGroupPatchSchema, { status: undefined });
  reject(contracts.BulkTaskPatchSchema, { dueDate: undefined });
  assert.deepEqual(contracts.BulkTaskPatchSchema.parse({ dueDate: null }), { dueDate: null });
});
test('closed enums, UUIDv7 membership keys, server fields and positive safe versions are enforced', () => {
  for (const status of ['in_progress', 'Done', 'cancelled']) reject(contracts.TaskStatusSchema, status);
  reject(contracts.EntityIdSchema, 'm1');
  reject(contracts.EntityIdSchema, '550e8400-e29b-41d4-a716-446655440000');
  for (const version of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) reject(contracts.VersionInputSchema, { expectedVersion: version });
  reject(contracts.CreateTaskInputSchema, { ...f.createTask, createdBy: f.ids.memberId });
  reject(contracts.CreateTaskInputSchema, { ...f.createTask, startDate: '2026-10-09', dueDate: '2026-10-08' });
  const parsed = contracts.CreateTaskInputSchema.parse(f.createTask);
  assert.equal(parsed.status, 'todo'); assert.equal(parsed.assigneeId, null); assert.deepEqual(parsed.subtasks, []);
});
test('cursor/query validation preserves filters and excludes pagination from summary scope', () => {
  for (const cursor of ['', 'a=b', '/evil', 'x'.repeat(2049)]) reject(contracts.CursorQuerySchema, { cursor });
  for (const limit of [0, 201, 1.1, '50']) reject(contracts.CursorQuerySchema, { limit });
  assert.equal(contracts.TaskQuerySchema.parse({}).limit, 50);
  const query = contracts.TaskQuerySchema.parse({ filters: [{ field: 'assignee', op: 'is', values: [null, f.ids.memberId] }] });
  assert.deepEqual(query.filters[0]?.values, [null, f.ids.memberId]);
  reject(contracts.TaskQuerySchema, { filters: [{ field: 'assignee', op: 'is', values: ['none'] }] });
  reject(contracts.TaskQuerySchema, { sortField: 'sql' });
  reject(contracts.TaskScopeQuerySchema, { limit: 1 });
  reject(contracts.TaskQuerySchema, { rangeFrom: '2026-10-10', rangeTo: '2026-10-08' });
  contracts.CursorPayloadSchema.parse({ formatVersion: 1, queryFingerprint: 'a'.repeat(64), sortField: 'due', sortDirection: 'asc', sortValue: '9999', id: f.ids.taskId });
});
test('bulk discriminants, column scope, atomic bounds and personal order are constrained', () => {
  contracts.BulkMutateTasksInputSchema.parse(f.bulk);
  contracts.BulkMutateTasksInputSchema.parse({ operation: 'archive', items: [], columnScope: { kind: 'workspace', status: 'done' } });
  reject(contracts.BulkMutateTasksInputSchema, { operation: 'complete', items: f.bulk.items });
  reject(contracts.BulkMutateTasksInputSchema, { operation: 'archive', items: [], columnScope: { kind: 'workspace', status: 'todo' } });
  reject(contracts.BulkMutateTasksInputSchema, { ...f.bulk, items: [f.bulk.items[0], f.bulk.items[0]] });
  reject(contracts.BulkMutateTasksInputSchema, { ...f.bulk, patch: { projectId: f.ids.projectId } });
  const unique = contracts.sourceTaskInventory.slice(0, 21).map(task => ({ id: task.id, expectedVersion: 1 }));
  reject(contracts.BulkMutateTasksInputSchema, { operation: 'delete', items: unique });
  contracts.UpdateProjectOrderInputSchema.parse(f.order);
  reject(contracts.UpdateProjectOrderInputSchema, { projectIds: [f.ids.projectId, f.ids.projectId] });
  reject(contracts.UndoResultSchema, { ...f.undoResult, affected: { arbitrary: [] } });
  reject(contracts.operations.undoCommand.request, { workspaceId: f.ids.workspaceId, undoId: f.ids.undoId, body: { oldValues: f.task } });
});
test('restricted projects exclude private child projections and real external services cannot be claimed', () => {
  contracts.ProjectListItemSchema.parse(f.restrictedProject);
  reject(contracts.ProjectListItemSchema, { ...f.restrictedProject, summary: f.projectSummary });
  reject(contracts.RestrictedProjectSchema, { ...f.restrictedProject.project, taskTitles: ['Private task'] });
  contracts.CapabilitiesSchema.parse(f.capabilities);
  for (const feature of Object.keys(contracts.externalServices)) reject(contracts.CapabilitiesSchema, { ...f.capabilities, features: { ...f.capabilities.features, [feature]: 'implemented' } });
  reject(contracts.FileSchema, { ...f.file, storageMode: 'r2', contentAvailable: false });
});
test('full view completeness checks count, dedupe and cursor exhaustion', () => {
  const complete = { items: [f.task], coverage: 'complete', matchedCount: 1, nextCursor: null, summary: f.summary };
  contracts.TaskViewDatasetSchema.parse(complete);
  reject(contracts.TaskViewDatasetSchema, { ...complete, nextCursor: 'YQ' });
  reject(contracts.TaskViewDatasetSchema, { ...complete, items: [] });
  reject(contracts.TaskViewDatasetSchema, { ...complete, items: [f.task, f.task] });
  contracts.TaskViewDatasetSchema.parse({ ...complete, coverage: 'partial', items: [], nextCursor: 'YQ' });
});
test('error fixtures, lifecycle and file identity are typed and bounded', () => {
  for (const error of f.errors) contracts.ApiErrorSchema.parse(error);
  reject(contracts.ApiErrorSchema, { error: { code: 'SUCCESS', message: 'fake' } });
  reject(contracts.ApiErrorSchema, { error: { code: 'INTERNAL_ERROR', message: 'oops', sql: 'secret' } });
  reject(contracts.TaskSchema, { ...f.task, status: 'done', completedAt: null });
  reject(contracts.UploadProjectFileInputSchema, { file: { name: 'x', mimeType: 'text/plain', bytes: new Uint8Array(10485761) }, clientRequestId: f.ids.clientRequestId });
});
test('locked deterministic identities retain exact source keys/titles/relations and counts', () => {
  const { data } = JSON.parse(readFileSync(new URL('../../docs/poc/reference/source-fixture.json', import.meta.url), 'utf8')) as { data: { tasks: { id: string; key: string; title: string; project: string; assignee: string | null; deps: string[] }[] } };
  assert.equal(contracts.sourceTaskInventory.length, 49);
  assert.equal(new Set(contracts.sourceIdentities.map(item => item.id)).size, contracts.sourceIdentities.length);
  for (const source of data.tasks) {
    const canonical = contracts.sourceTaskInventory.find(task => task.sourceId === source.id);
    assert(canonical); assert.equal(canonical.key, source.key); assert.equal(canonical.title, source.title);
    assert.equal(canonical.projectId, contracts.sourceId('projects', source.project));
    assert.equal(canonical.assigneeId, source.assignee ? contracts.sourceId('members', source.assignee) : null);
    assert.deepEqual(canonical.dependencyIds, source.deps.map(id => contracts.sourceId('tasks', id)));
  }
  assert.notEqual(contracts.sourceId('members', 'm1'), contracts.sourceId('users', 'm1'));
  assert.throws(() => contracts.sourceId('tasks', 'missing'));
});
