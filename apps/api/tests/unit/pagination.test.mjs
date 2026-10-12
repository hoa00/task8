import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindReadCursor, finishReadPage } from '../../src/shared/read-page.ts';
import { historySeek } from '../../src/db/history-seek.ts';
import { localeTupleSeek } from '../../src/db/locale-seek.ts';
const id = (suffix) => '01a11abd-aa80-7d3f-879a-dd89204bcd' + suffix;
test('read page retains full total and cursor tuple without depending on an anchor lookup', async () => {
  const scope = { workspace: 'a', kind: 'members' };
  const { binding } = await bindReadCursor({}, scope, 'title', 'asc');
  const first = finishReadPage(
    [
      { id: id('01'), name: 'Ä' },
      { id: id('02'), name: 'B' },
    ],
    300,
    1,
    binding,
    (row) => ({ id: row.id, value: row.name }),
  );
  assert.equal(first.total, 300);
  assert.deepEqual(first.items, [{ id: id('01'), name: 'Ä' }]);
  const decoded = await bindReadCursor({ cursor: first.nextCursor }, scope, 'title', 'asc');
  assert.equal(decoded.cursor.id, id('01'));
  assert.equal(decoded.cursor.sortValue, 'Ä');
  const next = finishReadPage([{ id: id('02'), name: 'B' }], 300, 2, binding, (row) => ({
    id: row.id,
    value: row.name,
  }));
  assert.equal(next.total, 300);
  assert.equal(next.nextCursor, null);
  await assert.rejects(
    bindReadCursor(
      { cursor: first.nextCursor },
      { workspace: 'b', kind: 'members' },
      'title',
      'asc',
    ),
  );
  await assert.rejects(bindReadCursor({ cursor: first.nextCursor }, scope, 'title', 'desc'));
});
test('seek directions distinguish archive ascending ID ties from descending history ties', async () => {
  const { binding } = await bindReadCursor({}, { workspace: 'a' }, 'updated', 'desc');
  const cursor = {
    formatVersion: 1,
    ...binding,
    id: id('02'),
    sortValue: '2026-10-12T00:00:00.000Z',
  };
  const history = historySeek('createdAt', 'id', cursor, 'desc');
  const archive = historySeek('archivedAt', 'id', cursor, 'desc', 'asc');
  assert.equal(history.sql, '(createdAt<? OR (createdAt=? AND id<?))');
  assert.equal(archive.sql, '(archivedAt<? OR (archivedAt=? AND id>?))');
  assert.deepEqual(history.parameters, [1791763200000, 1791763200000, id('02')]);
  assert.deepEqual(archive.parameters, history.parameters);
  const ranked = localeTupleSeek(
    'rank',
    'id',
    { ...cursor, sortValue: 2 },
    'asc',
    'asc',
    'numeric',
  );
  assert.equal(ranked.sql, '(rank>? OR (rank=? AND id>?))');
  assert.deepEqual(ranked.parameters, [2, 2, id('02')]);
  assert.throws(() => historySeek('createdAt', 'id', { ...cursor, sortValue: null }, 'desc'));
});
