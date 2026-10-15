import assert from 'node:assert/strict';
import test from 'node:test';
import { DateOnlySchema, EntityIdSchema } from '@studio/contracts/api';
import type { TaskDto, TaskQuery } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import {
  createFixedClock,
  evaluateTaskView,
  groupTasks,
  matchesTaskFilter,
  nextRecurrenceDate,
  sortTasks,
  summarizeTasks,
  TaskRelationError,
  validateTaskRelations,
} from '@studio/domain';
import { normalizeTaskView } from '../../src/features/tasks/task-view.ts';
import { createMockApi } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { runTaskFieldOperation } from '../../src/data/mock/task-fields.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import {
  decodeCurrentTaskView,
  encodeCurrentTaskView,
} from '../../src/features/tasks/current-view.ts';
const workspaceId = sourceId('workspaces', 'w1'),
  taskId = sourceId('tasks', 't3');
const data = createSeedDataset(),
  base = data.tasks[taskId]!;
const id = (number: number) =>
  EntityIdSchema.parse(`019a6257-0480-7000-8000-${number.toString().padStart(12, '0')}`);
const date = DateOnlySchema.parse;
const task = (number: number, patch: Partial<TaskDto> = {}): TaskDto => ({
  ...base,
  id: id(number),
  status: 'todo',
  completedAt: null,
  dueDate: null,
  startDate: null,
  assigneeId: null,
  priority: 'none',
  labelIds: [],
  dependencyIds: [],
  title: 'Same title',
  position: 100,
  estimate: null,
  ...patch,
});
const env = {
  today: fixtureClock.today(),
  now: Date.parse(fixtureClock.now()),
  lookups: { members: Object.values(data.members), projects: Object.values(data.projects) },
};
const apiError = (code: string) => (error: unknown) =>
  error instanceof StudioApiError && error.detail.code === code;

test('source DATA-08 due overlap, done past date, unassigned and AND/OR/NOT empty semantics', () => {
  const fixture = [
    task(1, { dueDate: date('2026-10-07') }),
    task(2, { dueDate: date('2026-10-08'), labelIds: ['design', 'qa'] }),
    task(3, { dueDate: date('2026-10-15'), assigneeId: sourceId('members', 'm1') }),
    task(4, { dueDate: date('2026-10-16') }),
    task(5),
    task(6, { status: 'done', completedAt: fixtureClock.now(), dueDate: date('2026-10-07') }),
  ];
  const groups = groupTasks(fixture, 'due', env);
  assert.deepEqual(
    groups.map((group) => [group.key, group.taskIds.map((id) => Number(id.slice(-12)))]),
    [
      ['overdue', [1]],
      ['today', [2]],
      ['week', [2, 3]],
      ['later', [4]],
      ['nodate', [5]],
    ],
  );
  assert.equal(new Set(groups.flatMap((group) => group.taskIds)).size, 5);
  assert.equal(summarizeTasks(fixture, env.today).total, 6);
  assert.equal(
    groups.reduce((sum, group) => sum + group.taskIds.length, 0),
    6,
  );
  assert.equal(summarizeTasks([...fixture, fixture[1]!], env.today).total, 6);
  const result = evaluateTaskView(
    fixture,
    normalizeTaskView({
      query: {
        filters: [
          { field: 'due', op: 'is', values: ['today', 'nodate'] },
          { field: 'assignee', op: 'is', values: [null] },
        ],
      },
    }),
    env,
  );
  assert.deepEqual(result.taskIds, [id(2), id(5)]);
  assert.equal(result.summary.total, 2);
  assert.equal(
    matchesTaskFilter(fixture[1]!, { field: 'labels', op: 'is', values: ['backend', 'qa'] }, env),
    true,
  );
  assert.equal(
    matchesTaskFilter(fixture[1]!, { field: 'status', op: 'not', values: [] }, env),
    true,
  );
  assert.equal(
    matchesTaskFilter(fixture[1]!, { field: 'status', op: 'not', values: ['done'] }, env),
    true,
  );
  assert.equal(
    matchesTaskFilter(fixture[5]!, { field: 'due', op: 'is', values: ['overdue'] }, env),
    false,
  );
});
test('source null/string/date/priority sort rules with explicit canonical stable ID correction', () => {
  const fixture = [
    task(3),
    task(2, { dueDate: date('2026-10-09'), estimate: '2h', title: 'Zulu', priority: 'urgent' }),
    task(1, { dueDate: date('2026-10-09'), estimate: '1d', title: 'Alpha', priority: 'low' }),
  ];
  const sorted = (sortField: TaskQuery['sortField'], sortDirection: 'asc' | 'desc' = 'asc') =>
    sortTasks(fixture, { sortField, sortDirection }, env.lookups).map((task) =>
      Number(task.id.slice(-12)),
    );
  assert.deepEqual(sorted('due'), [1, 2, 3]);
  assert.deepEqual(sorted('due', 'desc'), [3, 1, 2]);
  assert.deepEqual(sorted('estimate'), [1, 2, 3]);
  assert.deepEqual(sorted('priority'), [2, 1, 3]);
  assert.deepEqual(sorted('title'), [1, 3, 2]);
  assert.deepEqual(sorted('manual'), [1, 2, 3]); // Source stable input [3,2,1]; API_CONTRACT285 requires stable IDs.
  const timestamps = [
    task(1, { createdAt: createFixedClock('2026-10-01T00:00:00Z').now() }),
    task(2, { createdAt: fixtureClock.now() }),
  ];
  assert.deepEqual(
    sortTasks(timestamps, { sortField: 'created', sortDirection: 'asc' }, env.lookups).map(
      (task) => task.id,
    ),
    [id(2), id(1)],
  );
});
test('normalization validates inputs, unique columns/values, current URL independent from saved filters', () => {
  assert.throws(() =>
    normalizeTaskView({ query: { filters: [{ field: 'unknown', op: 'is', values: [] }] } }),
  );
  assert.throws(() => normalizeTaskView({ query: { rangeFrom: '2026-02-30' } }));
  assert.throws(() => normalizeTaskView({ hiddenColumns: ['title'] }));
  assert.throws(() => normalizeTaskView({ columnWidths: { status: NaN } }));
  const named = [{ field: 'status' as const, op: 'is' as const, values: ['progress' as const] }];
  const state = normalizeTaskView({ query: { filters: named } });
  const changed = { ...state, query: { ...state.query, filters: [] }, groupBy: 'due' as const };
  assert.deepEqual(named[0]!.values, ['progress']);
  assert.deepEqual(decodeCurrentTaskView(`?${encodeCurrentTaskView(changed)}`), changed);
  assert.deepEqual(decodeCurrentTaskView('?view=bad'), normalizeTaskView());
  assert.deepEqual(
    decodeCurrentTaskView(`?view=${encodeURIComponent(JSON.stringify(JSON.stringify(changed)))}`),
    changed,
  );
});
test('pure relation guard rejects foreign workspace/project/member/dependency, self and cycles', () => {
  const local = createSeedDataset();
  assert.throws(
    () => validateTaskRelations({ ...base, workspaceId: sourceId('workspaces', 'w2') }, local),
    TaskRelationError,
  );
  assert.throws(
    () => validateTaskRelations({ ...base, projectId: id(900) }, local),
    TaskRelationError,
  );
  assert.throws(
    () => validateTaskRelations({ ...base, assigneeId: id(901) }, local),
    TaskRelationError,
  );
  assert.throws(
    () => validateTaskRelations({ ...base, dependencyIds: [base.id] }, local),
    (error: unknown) => error instanceof TaskRelationError && error.reason === 'self',
  );
  const other = Object.values(local.tasks).find(
    (task) => task.id !== base.id && task.projectId === base.projectId,
  )!;
  local.tasks[other.id] = { ...other, dependencyIds: [base.id] };
  assert.throws(
    () => validateTaskRelations({ ...base, dependencyIds: [other.id] }, local),
    (error: unknown) => error instanceof TaskRelationError && error.reason === 'cycle',
  );
  local.tasks[other.id] = { ...other, workspaceId: sourceId('workspaces', 'w2') };
  assert.throws(
    () => validateTaskRelations({ ...base, dependencyIds: [other.id] }, local),
    TaskRelationError,
  );
});
test('mock fields validate nullable/date/status/relation atomically and omitted fields stay unchanged', async () => {
  const api = createMockApi();
  const before = (await api.getTask({ workspaceId, taskId })).data.task;
  await assert.rejects(
    api.updateTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.version, startDate: '2026-02-30' },
    }),
    apiError('VALIDATION_ERROR'),
  );
  await assert.rejects(
    api.updateTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.version, startDate: '2026-10-16', dueDate: '2026-10-15' },
    }),
    apiError('VALIDATION_ERROR'),
  );
  await assert.rejects(
    api.updateTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.version, assigneeId: id(999) },
    }),
    apiError('VALIDATION_ERROR'),
  );
  await assert.rejects(
    api.updateTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.version, dependencyIds: [taskId] },
    }),
    apiError('VALIDATION_ERROR'),
  );
  assert.deepEqual((await api.getTask({ workspaceId, taskId })).data.task, before);
  const changed = (
    await api.updateTask({
      workspaceId,
      taskId,
      body: {
        expectedVersion: before.version,
        assigneeId: null,
        dueDate: null,
        estimate: null,
        recurrence: null,
      },
    })
  ).data;
  assert.equal(changed.task.assigneeId, null);
  assert.equal(changed.task.dueDate, null);
  assert.equal(changed.task.startDate, before.startDate);
  assert.equal(changed.undo, null);
  assert.equal(changed.task.version, before.version + 1);
  await assert.rejects(
    api.updateTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.version, priority: 'high' },
    }),
    apiError('CONFLICT'),
  );
  await assert.rejects(
    api.updateTask({
      workspaceId: sourceId('workspaces', 'w2'),
      taskId,
      body: { expectedVersion: changed.task.version, priority: 'high' },
    }),
    apiError('NOT_FOUND'),
  );
});
test('actual command cycle returns409 and keeps versions, tasks, recurrence slots unchanged; incoming links bump targets', async () => {
  const local = createSeedDataset();
  const other = Object.values(local.tasks).find(
    (task) => task.id !== base.id && task.projectId === base.projectId,
  )!;
  local.tasks[other.id] = { ...other, dependencyIds: [base.id] };
  const before = structuredClone(local);
  await assert.rejects(
    runTaskFieldOperation(
      'updateTask',
      {
        workspaceId,
        taskId,
        body: { expectedVersion: base.version, dependencyIds: [other.id], status: 'done' },
      },
      local,
      fixtureClock,
    ),
    (error: unknown) =>
      error instanceof StudioApiError && error.detail.code === 'CONFLICT' && error.status === 409,
  );
  assert.deepEqual(local, before);
  local.tasks[other.id] = { ...other, dependencyIds: [] };
  const targetVersion = other.version;
  await runTaskFieldOperation(
    'updateTask',
    { workspaceId, taskId, body: { expectedVersion: base.version, dependencyIds: [other.id] } },
    local,
    fixtureClock,
  );
  assert.equal(local.tasks[other.id]!.version, targetVersion + 1);
  assert.equal(local.tasks[other.id]!.updatedAt, other.updatedAt);
  await runTaskFieldOperation(
    'updateTask',
    { workspaceId, taskId, body: { expectedVersion: base.version + 1, dependencyIds: [] } },
    local,
    fixtureClock,
  );
  assert.equal(local.tasks[other.id]!.version, targetVersion + 2);
});
test('completion Undo is bounded, replay stable and stale parent all-or-nothing', async () => {
  const api = createMockApi();
  const before = (await api.getTask({ workspaceId, taskId })).data.task;
  const done = (
    await api.setTaskCompletion({
      workspaceId,
      taskId,
      body: { expectedVersion: before.version, completed: true },
    })
  ).data;
  assert.equal(done.task.status, 'done');
  assert.equal(done.undo?.kind, 'task.complete');
  const input = { workspaceId, undoId: done.undo!.id, body: {} };
  const result = await api.undoCommand(input);
  const reopened = (await api.getTask({ workspaceId, taskId })).data.task;
  assert.equal(reopened.status, before.status);
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.version, done.task.version + 1);
  assert.deepEqual(await api.undoCommand(input), result);
  assert.equal((await api.getTask({ workspaceId, taskId })).data.task.version, reopened.version);
  const again = (
    await api.setTaskCompletion({
      workspaceId,
      taskId,
      body: { expectedVersion: reopened.version, completed: true },
    })
  ).data;
  await api.updateTask({
    workspaceId,
    taskId,
    body: { expectedVersion: again.task.version, priority: 'urgent' },
  });
  const changed = (await api.getTask({ workspaceId, taskId })).data.task;
  await assert.rejects(
    api.undoCommand({ workspaceId, undoId: again.undo!.id, body: {} }),
    apiError('CONFLICT'),
  );
  assert.deepEqual((await api.getTask({ workspaceId, taskId })).data.task, changed);
});
test('recurrence calendar correction, one slot and single Undo preserves successor with new subtask IDs', async () => {
  assert.equal(nextRecurrenceDate(date('2025-01-31'), 'monthly'), '2025-02-28');
  assert.equal(nextRecurrenceDate(date('2024-01-31'), 'monthly'), '2024-02-29');
  const api = createMockApi();
  const original = (await api.getTask({ workspaceId, taskId })).data.task;
  const prepared = (
    await api.updateTask({
      workspaceId,
      taskId,
      body: {
        expectedVersion: original.version,
        startDate: '2026-01-31',
        dueDate: '2026-01-31',
        recurrence: 'monthly',
      },
    })
  ).data.task;
  const result = (
    await api.setTaskCompletion({
      workspaceId,
      taskId,
      body: { expectedVersion: prepared.version, completed: true },
    })
  ).data;
  assert.equal(result.createdTasks.length, 1);
  const successor = result.createdTasks[0]!;
  assert.equal(successor.dueDate, '2026-02-28');
  assert.equal(successor.startDate, successor.dueDate);
  assert.notEqual(successor.id, taskId);
  assert.equal(successor.status, 'todo');
  assert.equal(successor.attachmentCount, 0);
  await api.undoCommand({ workspaceId, undoId: result.undo!.id, body: {} });
  assert.equal(
    (await api.getTask({ workspaceId, taskId: successor.id })).data.task.id,
    successor.id,
  );
  const reopened = (await api.getTask({ workspaceId, taskId })).data.task;
  assert.equal(
    (
      await api.setTaskCompletion({
        workspaceId,
        taskId,
        body: { expectedVersion: reopened.version, completed: true },
      })
    ).data.createdTasks.length,
    0,
  );
});
test('project field command scope/neighbor guards, move key+file integrity, full counts+opaque query cursors', async () => {
  const api = createMockApi();
  const before = (await api.getTask({ workspaceId, taskId })).data;
  await assert.rejects(
    api.moveTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.task.version, targetProjectId: id(999), scope: {} },
    }),
    apiError('VALIDATION_ERROR'),
  );
  await assert.rejects(
    api.moveTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.task.version, beforeId: taskId, scope: {} },
    }),
    apiError('VALIDATION_ERROR'),
  );
  const projectId =
    Object.values(data.projects).find(
      (project) =>
        project.id !== before.task.projectId &&
        project.visibility === 'workspace' &&
        project.status !== 'complete',
    )?.id ??
    Object.values(data.projects).find(
      (project) =>
        project.id !== before.task.projectId &&
        project.visibility !== 'private' &&
        project.status !== 'complete',
    )!.id;
  const moved = (
    await api.moveTask({
      workspaceId,
      taskId,
      body: { expectedVersion: before.task.version, targetProjectId: projectId, scope: {} },
    })
  ).data;
  assert.equal(moved.task.projectId, projectId);
  assert.equal(moved.undo, null);
  assert.notEqual(moved.task.key, before.task.key);
  const detail = (await api.getTask({ workspaceId, taskId })).data;
  assert.ok(detail.attachments.every((file) => file.projectId === projectId));
  const first = (await api.listTasks({ workspaceId, query: { limit: 2, sortField: 'due' } })).data;
  assert.equal(first.items.length, 2);
  assert.ok(first.total > 2);
  assert.ok(first.nextCursor);
  const second = (
    await api.listTasks({
      workspaceId,
      query: { limit: 2, sortField: 'due', cursor: first.nextCursor! },
    })
  ).data;
  assert.ok(second.items.every((task) => !first.items.some((old) => old.id === task.id)));
  assert.equal(second.total, first.total);
  await assert.rejects(
    api.listTasks({
      workspaceId,
      query: { limit: 2, sortField: 'title', cursor: first.nextCursor! },
    }),
    apiError('VALIDATION_ERROR'),
  );
  assert.equal((await api.getTaskSummary({ workspaceId, query: {} })).data.total, first.total);
});

test('command handlers reject actual foreign relation rows with zero writes and persist canonical Undo/sequence state', async () => {
  const local = createSeedDataset(),
    foreign = sourceId('workspaces', 'w2');
  const member = Object.values(local.members)[0]!,
    project = Object.values(local.projects).find((project) => project.id !== base.projectId)!,
    other = Object.values(local.tasks).find((task) => task.id !== base.id)!;
  local.members[id(901)] = { ...member, id: id(901), workspaceId: foreign };
  local.projects[id(902)] = { ...project, id: id(902), workspaceId: foreign };
  local.tasks[id(903)] = { ...other, id: id(903), workspaceId: foreign };
  const before = structuredClone(local);
  for (const patch of [{ assigneeId: id(901) }, { dependencyIds: [id(903)] }]) {
    await assert.rejects(
      runTaskFieldOperation(
        'updateTask',
        { workspaceId, taskId, body: { expectedVersion: base.version, ...patch } },
        local,
        fixtureClock,
      ),
      apiError('VALIDATION_ERROR'),
    );
    assert.deepEqual(local, before);
  }
  await assert.rejects(
    runTaskFieldOperation(
      'moveTask',
      {
        workspaceId,
        taskId,
        body: { expectedVersion: base.version, targetProjectId: id(902), scope: {} },
      },
      local,
      fixtureClock,
    ),
    apiError('VALIDATION_ERROR'),
  );
  assert.deepEqual(local, before);
  const storageRecords = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storageRecords.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageRecords.set(key, value);
    },
    removeItem: (key: string) => {
      storageRecords.delete(key);
    },
  };
  const api = createMockApi({ storage });
  const original = (await api.getTask({ workspaceId, taskId })).data.task;
  const completion = (
    await api.setTaskCompletion({
      workspaceId,
      taskId,
      body: { expectedVersion: original.version, completed: true },
    })
  ).data;
  const reload = createMockApi({ storage });
  await reload.undoCommand({ workspaceId, undoId: completion.undo!.id, body: {} });
  assert.equal((await reload.getTask({ workspaceId, taskId })).data.task.status, original.status);
});

test('plain status PATCH recurrence has no Undo and project task sequence never reuses keys', async () => {
  const api = createMockApi();
  let current = (await api.getTask({ workspaceId, taskId })).data.task;
  current = (
    await api.updateTask({
      workspaceId,
      taskId,
      body: {
        expectedVersion: current.version,
        startDate: '2026-01-31',
        dueDate: '2026-01-31',
        recurrence: 'monthly',
      },
    })
  ).data.task;
  const done = (
    await api.updateTask({
      workspaceId,
      taskId,
      body: { expectedVersion: current.version, status: 'done' },
    })
  ).data;
  assert.equal(done.undo, null);
  assert.equal(done.createdTasks.length, 1);
  assert.equal(done.createdTasks[0]!.dueDate, '2026-02-28');
  const targetProject = Object.values(data.projects).find(
    (project) =>
      project.id !== current.projectId &&
      project.visibility !== 'private' &&
      project.status !== 'complete',
  )!;
  const moved = (
    await api.moveTask({
      workspaceId,
      taskId,
      body: { expectedVersion: done.task.version, targetProjectId: targetProject.id, scope: {} },
    })
  ).data.task;
  const back = (
    await api.moveTask({
      workspaceId,
      taskId,
      body: { expectedVersion: moved.version, targetProjectId: current.projectId, scope: {} },
    })
  ).data.task;
  const again = (
    await api.moveTask({
      workspaceId,
      taskId,
      body: { expectedVersion: back.version, targetProjectId: targetProject.id, scope: {} },
    })
  ).data.task;
  assert.ok(Number(again.key.split('-').at(-1)) > Number(moved.key.split('-').at(-1)));
  assert.ok(Number(moved.key.split('-').at(-1)) > 200);
});

test('new mock clients own independent mutable command metadata', async () => {
  const first = createSeedDataset(),
    second = createSeedDataset();
  assert.notEqual(first.taskCommands, second.taskCommands);
  assert.notEqual(first.taskCommands.recurrenceSlots, second.taskCommands.recurrenceSlots);
  first.taskCommands.previousStatuses[taskId] = 'review';
  assert.equal(second.taskCommands.previousStatuses[taskId], undefined);
  const a = createMockApi(),
    b = createMockApi();
  const complete = (
    await a.setTaskCompletion({
      workspaceId,
      taskId,
      body: { expectedVersion: 1, completed: true },
    })
  ).data;
  await assert.rejects(
    b.undoCommand({ workspaceId, undoId: complete.undo!.id, body: {} }),
    apiError('NOT_FOUND'),
  );
  assert.equal((await b.getTask({ workspaceId, taskId })).data.task.version, 1);
});
