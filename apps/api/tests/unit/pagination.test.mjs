import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectionPage } from '../../src/modules/projection-page.ts';
import { historyPage } from '../../src/modules/collaboration-page.ts';
const id = (suffix) => '01a11abd-aa80-7d3f-879a-dd89204bcd' + suffix;
test('projection desc primary keeps ascending ID ties and survives a removed anchor', async () => {
  const a = { id: id('01'), value: 30 },
    b = { id: id('02'), value: 30 },
    c = { id: id('03'), value: 20 };
  const first = await projectionPage(
    [c, b, a],
    { limit: 1 },
    { workspace: 'a' },
    (row) => row.value,
    true,
  );
  assert.deepEqual(first.items, [a]);
  const next = await projectionPage(
    [c, b],
    { limit: 2, cursor: first.nextCursor },
    { workspace: 'a' },
    (row) => row.value,
    true,
  );
  assert.deepEqual(next.items, [b, c]);
  assert.equal(next.total, 2);
  assert.equal(next.nextCursor, null);
  await assert.rejects(
    projectionPage(
      [c, b],
      { limit: 2, cursor: first.nextCursor },
      { workspace: 'b' },
      (row) => row.value,
      true,
    ),
  );
});
test('history descending feed keeps descending ID ties after anchor removal', async () => {
  const rows = ['03', '02', '01'].map((suffix) => ({
    id: id(suffix),
    createdAt: '2026-10-12T00:00:00.000Z',
  }));
  const first = await historyPage(rows, { limit: 1 }, { member: 'a' }, true);
  const next = await historyPage(
    rows.slice(1),
    { limit: 2, cursor: first.nextCursor },
    { member: 'a' },
    true,
  );
  assert.deepEqual(
    next.items.map((row) => row.id),
    [id('02'), id('01')],
  );
  assert.equal(next.nextCursor, null);
  await assert.rejects(
    historyPage(rows, { limit: 1, cursor: first.nextCursor }, { member: 'b' }, true),
  );
});
