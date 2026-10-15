import assert from 'node:assert/strict';
import test from 'node:test';
import { DateOnlySchema, EntityIdSchema } from '@studio/contracts/api';
import type { TaskDto } from '@studio/contracts/api';
import { rescheduleDateOnly } from '@studio/domain';
import { normalizeTaskView } from '../../src/features/tasks/task-view.ts';
import { sourceId } from '@studio/contracts/source-identities';
import { createStudioClient } from '../../src/data/operations.ts';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { runTaskFieldOperation } from '../../src/data/mock/task-fields.ts';
import { loadTaskViewDataset } from '../../src/features/tasks/loadTaskViewDataset.ts';
const date = (value: string) => DateOnlySchema.parse(value),
  today = fixtureClock.today(),
  workspaceId = sourceId('workspaces', 'w1'),
  projectId = sourceId('projects', 'p1');
test('reschedule preserves duration including zero, omits absent start and validates canonical PATCH atomically', async () => {
  const client = createMockClient({ wait: async () => {} });
  const task = (await client.api.getTask({ workspaceId, taskId: sourceId('tasks', 't1') })).data
    .task;
  const prepared = await client.api.updateTask({
    workspaceId,
    taskId: task.id,
    body: {
      expectedVersion: task.version,
      startDate: date('2024-02-27'),
      dueDate: date('2024-02-29'),
    },
  });
  const moved = await client.api.updateTask({
    workspaceId,
    taskId: task.id,
    body: {
      expectedVersion: prepared.data.task.version,
      ...rescheduleDateOnly(prepared.data.task, date('2024-03-02')),
    },
  });
  assert.equal(moved.data.task.startDate, '2024-02-29');
  assert.equal(moved.data.task.dueDate, '2024-03-02');
  assert.equal(moved.data.undo, null);
  assert.deepEqual(rescheduleDateOnly({ startDate: null, dueDate: today }, date('2026-10-09')), {
    dueDate: '2026-10-09',
  });
  assert.deepEqual(rescheduleDateOnly({ startDate: today, dueDate: today }, date('2026-10-09')), {
    startDate: '2026-10-09',
    dueDate: '2026-10-09',
  });
  await assert.rejects(
    client.api.updateTask({
      workspaceId,
      taskId: task.id,
      body: { expectedVersion: 1, ...rescheduleDateOnly(moved.data.task, today) },
    }),
  );
  assert.deepEqual(
    (await client.api.getTask({ workspaceId, taskId: task.id })).data.task,
    moved.data.task,
  );
});
test('complete canonical due-range loader consumes >200 records, summary, abort and changed scope guards', async () => {
  const data = createSeedDataset(),
    base = Object.values(data.tasks).find((task) => task.projectId === projectId)!;
  for (let index = 0; index < 231; index++) {
    const task: TaskDto = {
      ...base,
      id: EntityIdSchema.parse(
        `019a6257-0480-7000-8000-${(10000 + index).toString().padStart(12, '0')}`,
      ),
      title: `Calendar coverage ${index}`,
      key: `WEB-${10000 + index}`,
      startDate: null,
      dueDate: today,
      archivedAt: null,
      status: 'todo',
      completedAt: null,
      position: index * 100,
      dependencyIds: [],
      recurrence: null,
    };
    data.tasks[task.id] = task;
  }
  const calls: string[] = [];
  const client = createStudioClient(async (id, input) => {
    calls.push(`${id}:${String((input.query as { cursor?: string })?.cursor ?? '')}`);
    return runTaskFieldOperation(id, input, data, fixtureClock);
  });
  const query = normalizeTaskView({
    query: {
      projectId,
      rangeFrom: today,
      rangeTo: today,
      rangeBasis: 'due',
      q: 'Calendar coverage',
    },
  }).query;
  const result = await loadTaskViewDataset(client, workspaceId, query);
  assert.equal(result.coverage, 'complete');
  assert.equal(result.items.length, 231);
  assert.equal(result.summary.total, 231);
  assert.equal(calls.filter((call) => call.startsWith('listTasks:')).length, 2);
  assert.equal(result.nextCursor, null);
  const first = await client.api.listTasks({ workspaceId, query: { ...query, limit: 200 } });
  assert.ok(first.data.nextCursor);
  const restarted = await loadTaskViewDataset(client, workspaceId, {
    ...query,
    cursor: first.data.nextCursor,
  });
  assert.equal(restarted.items.length, 231);
  const repeating = createStudioClient(async (id, input) =>
    id === 'listTasks' ? first : runTaskFieldOperation(id, input, data, fixtureClock),
  );
  await assert.rejects(
    loadTaskViewDataset(repeating, workspaceId, query),
    /cursor did not advance/,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(loadTaskViewDataset(client, workspaceId, query, abort.signal), {
    name: 'AbortError',
  });
  const changing = createStudioClient(async (id, input) => {
    if (id === 'listTasks' && (input.query as { cursor?: string })?.cursor)
      delete data.tasks[EntityIdSchema.parse('019a6257-0480-7000-8000-000000010230')];
    return runTaskFieldOperation(id, input, data, fixtureClock);
  });
  await assert.rejects(loadTaskViewDataset(changing, workspaceId, query), /scope changed/);
});
test('read-only events enforce range/project/authorization', async () => {
  const client = createMockClient({ wait: async () => {} }),
    query = { from: date('2026-09-01'), to: date('2026-11-30') };
  const events = (await client.api.listCalendarEvents({ workspaceId, query })).data;
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.date >= query.from && event.date <= query.to));
  const projectEvents = (
    await client.api.listCalendarEvents({ workspaceId, query: { ...query, projectId } })
  ).data;
  assert.ok(projectEvents.every((event) => event.projectId === projectId));
  await assert.rejects(
    client.api.listCalendarEvents({
      workspaceId,
      query: { ...query, projectId: sourceId('projects', 'p6') },
    }),
  );
  await assert.rejects(
    client.api.listCalendarEvents({ workspaceId, query: { from: query.to, to: query.from } }),
  );
});
