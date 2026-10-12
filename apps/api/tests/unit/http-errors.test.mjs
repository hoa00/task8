import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { mapError } from '../../src/http/error-handler.ts';
import { page } from '../../src/modules/shared.ts';

const id = (suffix) => '01a11abd-aa80-7d3f-879a-dd89204bcd' + suffix;
test('internal DTO ZodError returns500 with no internal message', async () => {
  const app = new Hono();
  app.onError(mapError);
  app.get('/internal', () => z.string().parse(123));
  const response = await app.request('/internal');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: { code: 'INTERNAL_ERROR', message: 'Request failed' },
  });
});
test('project/member tuple cursor survives removed or renamed anchors', async () => {
  const rows = [
    { id: id('01'), name: 'A' },
    { id: id('02'), name: 'B' },
    { id: id('03'), name: 'C' },
  ];
  const scope = { workspace: 'a', kind: 'members' };
  const first = await page(rows, { limit: 1 }, scope, (row) => row.name);
  const next = await page(
    rows.slice(1),
    { limit: 2, cursor: first.nextCursor },
    scope,
    (row) => row.name,
  );
  assert.deepEqual(next.items, rows.slice(1));
  const renamed = await page(
    [rows[1], rows[2], { ...rows[0], name: 'D' }],
    { limit: 3, cursor: first.nextCursor },
    scope,
    (row) => row.name,
  );
  assert.deepEqual(
    renamed.items.map((row) => row.name),
    ['B', 'C', 'D'],
  );
});
