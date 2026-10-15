import assert from 'node:assert/strict';
import test from 'node:test';
import { DateOnlySchema } from '@studio/contracts/api';
import {
  buildCalendarCells,
  navigateCalendar,
  rescheduleDateOnly,
  startOfCalendarWeek,
} from '../src/index.ts';
const date = (value: string) => DateOnlySchema.parse(value),
  today = date('2026-10-08');
test('calendar DateOnly is invariant across UTC, DST transitions and fractional-offset timezones', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of [
      'UTC',
      'America/New_York',
      'Europe/Berlin',
      'Pacific/Auckland',
      'Asia/Kathmandu',
      'Pacific/Kiritimati',
    ]) {
      process.env.TZ = timezone;
      for (const [from, to, start] of [
        ['2026-03-08', '2026-03-09', '2026-03-07'],
        ['2026-11-01', '2026-11-02', '2026-10-31'],
        ['2024-02-29', '2024-03-01', '2024-02-28'],
      ])
        assert.deepEqual(
          rescheduleDateOnly({ dueDate: date(from!), startDate: date(start!) }, date(to!)),
          { dueDate: to, startDate: from },
        );
      assert.equal(startOfCalendarWeek(date('2026-03-08'), 1), '2026-03-02');
      assert.deepEqual(
        buildCalendarCells(date('2026-03-08'), 'week', 0, today).map((cell) => cell.date),
        [
          '2026-03-08',
          '2026-03-09',
          '2026-03-10',
          '2026-03-11',
          '2026-03-12',
          '2026-03-13',
          '2026-03-14',
        ],
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test('month geometry uses source minimum35 or42, leap boundaries and every weekStart', () => {
  assert.equal(buildCalendarCells(date('2026-02-01'), 'month', 0, today).length, 35);
  const six = buildCalendarCells(date('2026-08-31'), 'month', 1, today);
  assert.equal(six.length, 42);
  assert.equal(six[0]!.date, '2026-07-27');
  assert.equal(six.at(-1)!.date, '2026-09-06');
  const leap = buildCalendarCells(date('2024-02-29'), 'month', 1, date('2024-02-29'));
  assert.equal(leap.filter((cell) => cell.today).length, 1);
  assert.equal(leap.find((cell) => cell.today)!.day, 29);
  for (const weekStart of [0, 1, 6] as const) {
    const cells = buildCalendarCells(today, 'month', weekStart, today);
    assert.equal(new Date(`${cells[0]!.date}T00:00:00Z`).getUTCDay(), weekStart);
    assert.ok(cells.length === 35 || cells.length === 42);
    assert.equal(cells.find((cell) => cell.today)!.outside, false);
  }
  assert.throws(() => date('2026-02-29'));
  assert.throws(() => date('2024-04-31'));
});
test('previous/next reset month to first, week crosses year and Today retains fixture day', () => {
  assert.equal(navigateCalendar(date('2024-01-31'), 'month', 1, today), '2024-02-01');
  assert.equal(navigateCalendar(date('2026-01-31'), 'month', -1, today), '2025-12-01');
  assert.equal(navigateCalendar(date('2026-12-29'), 'week', 1, today), '2027-01-05');
  assert.equal(navigateCalendar(date('2027-01-05'), 'week', -1, today), '2026-12-29');
  for (const mode of ['month', 'week'] as const)
    assert.equal(navigateCalendar(date('2024-02-29'), mode, 0, today), today);
});
