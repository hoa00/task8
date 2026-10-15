import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '@studio/domain';
import { DateOnlySchema, TaskQuerySchema } from '@studio/contracts/api';
import { taskDatePatch } from '../../src/features/tasks/date-patch.ts';
import { normalizeTaskView } from '../../src/features/tasks/task-view.ts';
import { taskDatasetKey } from '../../src/features/tasks/task-dataset-key.ts';
import { readProjectView, decodeProjectView } from '../../src/features/projects/project-view.ts';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createStudioClient } from '../../src/data/operations.ts';
import { loadTaskViewDataset } from '../../src/features/tasks/loadTaskViewDataset.ts';
const date = (value: string) => DateOnlySchema.parse(value);

test('record date edits clamp crossing endpoints consistently; draft, null and omitted fields remain distinct', () => {
  const current = { startDate: date('2026-03-05'), dueDate: date('2026-03-10') };
  for (const [field, next, expected] of [
    ['dueDate', '2026-03-01', { dueDate: date('2026-03-01'), startDate: date('2026-03-01') }],
    ['startDate', '2026-03-15', { startDate: date('2026-03-15'), dueDate: date('2026-03-15') }],
    ['startDate', '2026-03-08', { startDate: date('2026-03-08') }],
  ] as const)
    assert.deepEqual(taskDatePatch(current, field, date(next), 'record'), expected);
  assert.deepEqual(taskDatePatch(current, 'dueDate', null, 'record'), { dueDate: null });
  assert.deepEqual(taskDatePatch(current, 'startDate', null, 'record'), { startDate: null });
  assert.deepEqual(taskDatePatch(current, 'dueDate', date('2026-03-01'), 'draft'), {
    dueDate: date('2026-03-01'),
  });
  assert.deepEqual(
    taskDatePatch({ startDate: null, dueDate: null }, 'startDate', date('2026-03-15'), 'record'),
    { startDate: date('2026-03-15') },
  );
});

test('column preferences belong to web while complete dataset keys ignore page cursor and limit', () => {
  assert.equal('taskColumns' in domain, false);
  assert.equal('normalizeTaskView' in domain, false);
  assert.equal(normalizeTaskView().hiddenColumns.includes('start'), true);
  assert.deepEqual(
    taskDatasetKey(
      '019f4800-0000-7000-8000-000000000001',
      TaskQuerySchema.parse({ limit: 1, cursor: 'YWJj' }),
    ),
    taskDatasetKey('019f4800-0000-7000-8000-000000000001', TaskQuerySchema.parse({ limit: 200 })),
  );
  assert.notDeepEqual(
    taskDatasetKey(
      '019f4800-0000-7000-8000-000000000001',
      TaskQuerySchema.parse({ q: 'different' }),
    ),
    taskDatasetKey('019f4800-0000-7000-8000-000000000001', TaskQuerySchema.parse({})),
  );
});

test('project preference reads never write and malformed values retain scoped saved defaults', async () => {
  const client = createMockClient();
  const workspaceId = (await client.api.getSession({})).data.currentWorkspaceId!;
  const data = (await client.api.getBootstrap({ workspaceId })).data,
    project = data.projects.find((row) => row.access === 'allowed')!.project;
  let writes = 0;
  const storage = {
    getItem: () => '{bad',
    setItem: () => {
      writes++;
    },
  };
  const first = readProjectView(workspaceId, data.currentMember.id, project.id, undefined, storage);
  assert.equal(writes, 0);
  assert.equal(first.hiddenColumns.includes('project'), true);
  assert.deepEqual(decodeProjectView('{broken', first), first);
  const next = normalizeTaskView({ ...first, query: { q: 'new preference' } });
  assert.deepEqual(decodeProjectView(JSON.stringify(next), first), next);
  const saved = (
    await client.api.createSavedView({
      workspaceId,
      projectId: project.id,
      body: {
        name: 'Personal',
        type: 'list',
        filters: [{ field: 'priority', op: 'is', values: ['high'] }],
      },
    })
  ).data;
  assert.deepEqual(
    readProjectView(workspaceId, data.currentMember.id, project.id, saved, storage).query.filters,
    saved.filters,
  );
  assert.equal(writes, 0);
});

test('one complete loader rejects repeated cursors and concurrent coverage changes', async () => {
  const mock = createMockClient();
  const workspaceId = (await mock.api.getSession({})).data.currentWorkspaceId!;
  const query = TaskQuerySchema.parse({}),
    seed = (await mock.api.listTasks({ workspaceId, query })).data.items[0]!;
  let pages = 0;
  const looping = createStudioClient(async (id, input, options) =>
    id === 'listTasks'
      ? (pages++, { data: { items: [seed], total: 2, nextCursor: 'YWJj' } })
      : mock.execute(id, input as never, options),
  );
  await assert.rejects(loadTaskViewDataset(looping, workspaceId, query), /cursor did not advance/);
  assert.equal(pages, 2);
  const changed = createStudioClient(async (id, input, options) => {
    const result = await mock.execute(id, input as never, options);
    if (id === 'getTaskSummary') {
      return { data: domain.summarizeTasks([seed], date('2026-03-01')) };
    }
    return result;
  });
  await assert.rejects(loadTaskViewDataset(changed, workspaceId, query), /scope changed/);
});
