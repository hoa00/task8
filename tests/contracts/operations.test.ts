import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { operations, sourceIdentities, catalogs } from '../../packages/contracts/src/index.ts';
import type { OperationId } from '../../packages/contracts/src/index.ts';
import { operationSamples } from './operation-samples.ts';
import './coverage.ts';

for (const id of Object.keys(operations) as OperationId[]) {
  test(`${id}: request/response fixture validates shared boundary`, () => {
    const operation = operations[id];
    const fixture = operationSamples[id];
    operation.request.parse(fixture.request);
    operation.response.parse(fixture.response);
    assert.equal(operation.request.safeParse({ ...fixture.request, unexpected: true }).success, false);
    if (operation.transport === 'json') assert.equal(operation.response.safeParse({ ...fixture.response, sql: 'hidden' }).success, false);
  });
}
test('locked identity UUIDs and catalog enums derive from a single canonical definition', () => {
  assert.equal(sourceIdentities.length, 156);
  assert.deepEqual(catalogs.taskStatuses.map(item => item.name), ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);
  assert.deepEqual(catalogs.estimates, ['30m', '1h', '2h', '4h', '1d', '2d', '3d', '5d', '8d']);
  const model = readFileSync(new URL('../../packages/contracts/src/models.ts', import.meta.url), 'utf8');
  assert.equal(/z\.(?:any|unknown)\(|Record\s*</.test(model), false, 'DTOs cannot be free untyped records');
});
