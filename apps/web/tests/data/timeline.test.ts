import assert from 'node:assert/strict';
import test from 'node:test';
import type { OperationInput } from '@studio/contracts/api';
import { DateOnlySchema } from '@studio/contracts/api';
import {
  addDateDays,
  buildTimelineGeometry,
  normalizeTaskView,
  rescheduleDateOnly,
  timelineDayOffset,
  timelineRange,
} from '@studio/domain';
import type { TimelineGrouping } from '@studio/domain';
import { sourceId } from '@studio/contracts/source-identities';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createStudioClient } from '../../src/data/operations.ts';
import { loadTaskViewDataset } from '../../src/features/tasks/loadTaskViewDataset.ts';
const date = (value: string) => DateOnlySchema.parse(value),
  today = fixtureClock.today(),
  seed = createSeedDataset(),
  tasks = Object.values(seed.tasks),
  projects = Object.values(seed.projects),
  lookups = { members: Object.values(seed.members), projects },
  workspaceId = seed.workspaceId;
const input = {
  tasks,
  milestones: [],
  lookups,
  today,
  weekStart: 1 as const,
  zoom: 'week' as const,
  grouping: 'none' as const,
};
test('Timeline date ranges retain source91/238 days and UTC weekStart across DST/leap/year', () => {
  assert.deepEqual(timelineRange(today, 'week', 1), {
    start: '2026-09-14',
    end: '2026-12-13',
    days: 91,
    dayWidth: 32,
  });
  assert.deepEqual(timelineRange(today, 'month', 1), {
    start: '2026-08-10',
    end: '2027-04-04',
    days: 238,
    dayWidth: 11,
  });
  const previous = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/New_York', 'Asia/Kathmandu', 'Pacific/Auckland']) {
      process.env.TZ = timezone;
      for (const value of ['2026-03-08', '2026-11-01', '2024-02-29', '2027-01-01'])
        for (const weekStart of [0, 1, 6] as const) {
          const range = timelineRange(date(value), 'week', weekStart);
          assert.equal(new Date(`${range.start}T00:00:00Z`).getUTCDay(), weekStart);
          assert.equal(range.end, addDateDays(range.start, 90));
        }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test('bar inclusive duration, 110px label threshold, progress and undated/empty rows are deterministic', () => {
  const a = {
      ...tasks[0]!,
      startDate: date('2026-10-01'),
      dueDate: date('2026-10-04'),
      status: 'progress' as const,
      subtaskSummary: { total: 3, completed: 2 },
    },
    b = { ...tasks[1]!, startDate: null, dueDate: date('2026-10-05') };
  const geometry = buildTimelineGeometry({
    ...input,
    tasks: [a, b, { ...tasks[2]!, dueDate: null }],
  });
  assert.equal(geometry.bars.length, 2);
  assert.equal(geometry.bars[0]!.width, 128);
  assert.equal(geometry.bars[0]!.x, 17 * 32);
  assert.equal(geometry.bars[0]!.y, 7);
  assert.equal(geometry.bars[0]!.inside, true);
  assert.equal(geometry.bars[0]!.progress, 67);
  assert.equal(geometry.bars[1]!.width, 32);
  assert.equal(geometry.bars[1]!.inside, false);
  assert.equal(geometry.bars[1]!.y, 43);
  assert.equal(buildTimelineGeometry({ ...input, tasks: [] }).rows.length, 0);
  assert.equal(
    buildTimelineGeometry({ ...input, tasks: [{ ...a, dueDate: null }] }).bars.length,
    0,
  );
});
test('shared grouping keeps task set and source reverse-input date ties; project requested group falls back to status', () => {
  for (const grouping of ['status', 'assignee', 'project', 'none'] as TimelineGrouping[]) {
    const geometry = buildTimelineGeometry({ ...input, grouping });
    assert.deepEqual(
      geometry.bars.map((bar) => bar.task.id).sort(),
      tasks
        .filter((task) => task.dueDate)
        .map((task) => task.id)
        .sort(),
    );
    assert.equal(
      geometry.rows.filter((row) => row.kind === 'group').length === 0,
      grouping === 'none',
    );
  }
  const geometry = buildTimelineGeometry({
    ...input,
    grouping: 'project',
    projectId: projects[0]!.id,
    tasks: tasks.filter((task) => task.projectId === projects[0]!.id),
  });
  assert.equal(geometry.effectiveGrouping, 'status');
  const tied = tasks.slice(0, 2).map((task) => ({ ...task, startDate: null, dueDate: today }));
  assert.deepEqual(
    buildTimelineGeometry({ ...input, tasks: tied }).bars.map((bar) => bar.task.id),
    [...tied].reverse().map((task) => task.id),
  );
});
test('dependency cubic/arrow coordinates preserve forward/backward dash and omit hidden endpoints', () => {
  const a = { ...tasks[0]!, startDate: today, dueDate: today, dependencyIds: [] },
    b = {
      ...tasks[1]!,
      startDate: date('2026-10-10'),
      dueDate: date('2026-10-10'),
      dependencyIds: [a.id],
    },
    c = {
      ...tasks[2]!,
      startDate: date('2026-10-09'),
      dueDate: date('2026-10-09'),
      dependencyIds: [b.id],
    };
  const geometry = buildTimelineGeometry({ ...input, tasks: [a, b, c] });
  assert.equal(geometry.edges.length, 2);
  assert.deepEqual(
    geometry.edges.find((edge) => edge.to === b.id),
    {
      from: a.id,
      to: b.id,
      backward: false,
      path: 'M800 18 C 822 18, 810 90, 831 90',
      arrow: 'M826 86.5 L831 90 L826 93.5',
    },
  );
  assert.equal(geometry.edges.find((edge) => edge.to === c.id)!.backward, true);
  assert.deepEqual(
    geometry.edges.map((edge) => edge.to),
    [b.id, c.id],
  );
  assert.equal(buildTimelineGeometry({ ...input, tasks: [b] }).edges.length, 0);
});
test('milestone same-day merge, room threshold, final unbounded label and empty-task lane preserve source geometry', () => {
  const base = projects[0]!.milestones[0]!,
    milestones = [
      base,
      { ...base, id: sourceId('milestones', 'p1:1'), date: base.date, name: 'Second' },
      { ...base, id: sourceId('milestones', 'p1:2'), date: addDateDays(base.date, 1) },
    ];
  const geometry = buildTimelineGeometry({ ...input, tasks: [], milestones });
  assert.equal(geometry.rows.length, 1);
  assert.equal(geometry.milestonePoints.length, 2);
  assert.equal(geometry.milestonePoints[0]!.label, `${base.name} +1`);
  assert.equal(geometry.milestonePoints[0]!.showLabel, false);
  assert.equal(geometry.milestonePoints[0]!.maxWidth, 8);
  assert.equal(geometry.milestonePoints[1]!.maxWidth, undefined);
  const month = buildTimelineGeometry({ ...input, tasks: [], milestones, zoom: 'month' });
  assert.equal(month.milestonePoints[0]!.maxWidth, -13);
  assert.equal(month.milestonePoints[1]!.showLabel, true);
});
test('pointer rounding includes signed half-days and scroll delta; shared PATCH preserves duration/no-start omission', () => {
  assert.equal(timelineDayOffset(15, 0, 32), 0);
  assert.equal(timelineDayOffset(16, 0, 32), 1);
  assert.equal(timelineDayOffset(-16, 0, 32), -0);
  assert.equal(timelineDayOffset(-17, 0, 32), -1);
  assert.equal(timelineDayOffset(5.5, 0, 11), 1);
  assert.equal(timelineDayOffset(0, 64, 32), 2);
  assert.equal(timelineDayOffset(32, -64, 32), -1);
  assert.throws(() => timelineDayOffset(NaN, 0, 32));
  assert.deepEqual(
    rescheduleDateOnly(
      { startDate: date('2026-10-01'), dueDate: date('2026-10-08') },
      date('2026-10-10'),
    ),
    { startDate: '2026-10-03', dueDate: '2026-10-10' },
  );
  assert.deepEqual(rescheduleDateOnly({ startDate: null, dueDate: today }, date('2026-10-10')), {
    dueDate: '2026-10-10',
  });
});
test('complete canonical overlap consumes231 records/two pages, excludes outside-range and keeps start-only without bar', async () => {
  const raw = createMockClient({ wait: async () => {} }),
    projectId = projects[0]!.id;
  for (let index = 0; index < 231; index++)
    await raw.api.createTask({
      workspaceId,
      body: {
        clientRequestId: crypto.randomUUID(),
        projectId,
        title: `Timeline231 ${index}`,
        startDate: today,
        dueDate: addDateDays(today, 2),
      },
    });
  const pages: number[] = [],
    client = createStudioClient(async (id, payload, options) => {
      const response = await raw.execute(id, payload as OperationInput<typeof id>, options);
      if (id === 'listTasks' && 'data' in response)
        pages.push((response.data as { items: unknown[] }).items.length);
      return response;
    });
  const range = timelineRange(today, 'week', 1),
    query = normalizeTaskView({
      query: {
        q: 'Timeline231',
        rangeFrom: range.start,
        rangeTo: range.end,
        rangeBasis: 'overlap',
      },
    }).query;
  const dataset = await loadTaskViewDataset(client, workspaceId, query);
  assert.deepEqual(pages, [200, 31]);
  assert.equal(dataset.matchedCount, 231);
  assert.equal(dataset.coverage, 'complete');
  const outside = await raw.api.createTask({
    workspaceId,
    body: {
      clientRequestId: crypto.randomUUID(),
      projectId,
      title: 'Timeline range outside',
      startDate: date('2027-10-01'),
      dueDate: date('2027-10-03'),
    },
  });
  const startOnly = await raw.api.createTask({
    workspaceId,
    body: {
      clientRequestId: crypto.randomUUID(),
      projectId,
      title: 'Timeline range start only',
      startDate: today,
    },
  });
  const scoped = await loadTaskViewDataset(
    raw,
    workspaceId,
    normalizeTaskView({ query: { ...query, q: 'Timeline range' } }).query,
  );
  assert.equal(
    scoped.items.some((task) => task.id === outside.data.task.id),
    false,
  );
  assert.equal(
    scoped.items.some((task) => task.id === startOnly.data.task.id),
    true,
  );
  assert.equal(buildTimelineGeometry({ ...input, tasks: scoped.items }).bars.length, 0);
});
