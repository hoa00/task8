import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { mapError } from '../../src/http/error-handler.ts';

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
