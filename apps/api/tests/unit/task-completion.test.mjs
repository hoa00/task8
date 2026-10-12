import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideCompletion,
  transitionCompletion,
} from '../../src/modules/tasks/domain/completion.ts';
import { completionProjection } from '../../src/modules/tasks/mapper.ts';

const statuses = ['backlog', 'todo', 'progress', 'review', 'done'];
test('dedicated completion preserves noop, restores previous status and falls back to todo', () => {
  for (const status of statuses) {
    for (const previousStatus of [null, ...statuses]) {
      const state = { status, previousStatus, completedAt: status === 'done' ? 42 : null };
      for (const completed of [false, true]) {
        const decision = decideCompletion(state, completed);
        assert.equal(decision.kind, completed === (status === 'done') ? 'noop' : 'change');
        assert.equal(
          decision.status,
          decision.kind === 'noop'
            ? status
            : completed
              ? 'done'
              : previousStatus && previousStatus !== 'done'
                ? previousStatus
                : 'todo',
        );
      }
    }
  }
});
test('status transition preserves original completion timestamp and records previous status only on entering done', () => {
  const source = { status: 'progress', previousStatus: 'todo', completedAt: null };
  const done = transitionCompletion(source, 'done', 123);
  assert.deepEqual(done, { status: 'done', previousStatus: 'progress', completedAt: 123 });
  assert.deepEqual(transitionCompletion(done, 'done', 999), done);
  assert.deepEqual(transitionCompletion(done, 'review', 999), {
    status: 'review',
    previousStatus: 'progress',
    completedAt: null,
  });
  assert.deepEqual(source, { status: 'progress', previousStatus: 'todo', completedAt: null });
});
test('internal status corruption is rejected by projection mapper', () => {
  assert.throws(() =>
    completionProjection({ status: 'invalid', previousStatus: null, completedAt: null }),
  );
  assert.throws(() =>
    completionProjection({ status: 'done', previousStatus: 'invalid', completedAt: 123 }),
  );
});
