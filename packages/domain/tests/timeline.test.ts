import assert from 'node:assert/strict';
import test from 'node:test';
import { DateOnlySchema } from '@studio/contracts/api';
import { addDateDays, timelineRange } from '../src/index.ts';
const date = (value: string) => DateOnlySchema.parse(value),
  today = date('2026-10-08');
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
