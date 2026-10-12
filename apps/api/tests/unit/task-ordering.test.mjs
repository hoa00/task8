import assert from 'node:assert/strict';
import test from 'node:test';
import { EntityIdSchema } from '@studio/contracts/api';
import { planTaskOrder } from '../../src/modules/tasks/domain/ordering.ts';
const id = (n) => EntityIdSchema.parse('019a7bc0-0000-7000-8000-' + String(n).padStart(12, '0'));
const entry = (n, position) => ({ id: id(n), position });
test('ordering checks adjacent neighbors, endpoints and insertion position', () => {
  const rows = [entry(1, 0), entry(2, 100), entry(3, 200)];
  assert.equal(planTaskOrder(rows, id(4), id(2), id(1)).position, 50);
  assert.equal(planTaskOrder(rows, id(4), id(1), null).position, -100);
  assert.equal(planTaskOrder(rows, id(4), null, id(3)).position, 300);
  assert.equal(planTaskOrder([], id(4), null, null).position, 0);
  assert.throws(() => planTaskOrder(rows, id(4), id(3), id(1)), { code: 'VALIDATION_ERROR' });
  assert.throws(() => planTaskOrder(rows, id(4), id(9), null), { code: 'VALIDATION_ERROR' });
});
test('exhausted gap produces complete deterministic rebalance without mutating snapshots', () => {
  const rows = [entry(1, 10), entry(2, 11), entry(3, 12)];
  assert.deepEqual(planTaskOrder(rows, id(4), id(2), id(1)), {
    position: 110,
    neighbors: [entry(1, 10), entry(2, 210), entry(3, 310)],
  });
  assert.deepEqual(rows, [entry(1, 10), entry(2, 11), entry(3, 12)]);
});
test('rebalance bounds and unsafe integer positions reject before writes', () => {
  const rows = Array.from({ length: 128 }, (_, i) => entry(i + 1, i));
  assert.throws(() => planTaskOrder(rows, id(200), id(2), id(1)), { code: 'VIEW_SCOPE_TOO_LARGE' });
  assert.throws(() => planTaskOrder([entry(1, Number.MAX_SAFE_INTEGER)], id(2), null, null), {
    code: 'VIEW_SCOPE_TOO_LARGE',
  });
});
