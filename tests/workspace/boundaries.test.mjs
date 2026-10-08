import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImport, checkBoundaries } from './boundaries.mjs';

test('shared packages accept only their own dependency direction', () => {
  assert.doesNotThrow(() => validateImport('ui', 'react/jsx-runtime'));
  assert.doesNotThrow(() => validateImport('ui', 'react-dom'));
  assert.doesNotThrow(() => validateImport('contracts', 'zod'));
  assert.doesNotThrow(() => validateImport('domain', '@studio/contracts'));
  for (const [owner, specifier] of [
    ['contracts', 'react'], ['contracts', 'hono'], ['contracts', 'drizzle-orm'],
    ['ui', '@studio/contracts'], ['ui', '@tanstack/react-router'],
    ['domain', 'node:fs'], ['domain', '@studio/web'],
  ]) assert.throws(() => validateImport(owner, specifier));
  assert.equal(checkBoundaries().status, 'passed');
});
