import assert from 'node:assert/strict';
import test from 'node:test';
import { UndoKindSchema } from '@studio/contracts/api';
import { undoHandlers } from '../../src/modules/undo/index.ts';
test('every canonical Undo kind has an owned handler and registry construction performs no I/O', () => {
  let calls = 0;
  const handlers = undoHandlers(async () => {
    calls++;
    throw new Error('unexpected file invocation');
  });
  assert.deepEqual(Object.keys(handlers).sort(), [...UndoKindSchema.options].sort());
  assert.equal(calls, 0);
  for (const handler of Object.values(handlers)) assert.equal(typeof handler, 'function');
});
