import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRouteSearch } from '../../src/app/navigation.ts';
import { decodeCurrentTaskView } from '../../src/features/tasks/current-view.ts';
test('calendar URL fields normalize DateOnly/mode without changing task presentation mode', () => {
  assert.deepEqual(
    validateRouteSearch({ calendarDate: '2026-11-01', calendarMode: 'week', mode: 'calendar' }),
    { calendarDate: '2026-11-01', calendarMode: 'week', mode: 'calendar' },
  );
  for (const calendarDate of ['2026-02-30', '2026-11-01T00:00:00Z', null])
    assert.equal(
      validateRouteSearch({ calendarDate, calendarMode: 'day' }).calendarDate,
      undefined,
    );
  assert.equal(validateRouteSearch({ calendarMode: 'day' }).calendarMode, undefined);
  assert.deepEqual(decodeCurrentTaskView('?view=bad'), decodeCurrentTaskView(''));
});
