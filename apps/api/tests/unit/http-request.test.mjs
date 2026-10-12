import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { TaskQuerySchema } from '@studio/contracts/api';
import { mapError } from '../../src/http/error-handler.ts';
import { correlationMiddleware } from '../../src/http/correlation.ts';
import {
  jsonBody,
  noInput,
  parseRequest,
  readQuery,
  readRequestBytes,
} from '../../src/http/request.ts';

const app = new Hono();
app.onError(mapError);
app.use('*', correlationMiddleware);
app.get('/query', async (c) => c.json(parseRequest(TaskQuerySchema, await readQuery(c))));
app.put('/empty', async (c) => {
  await noInput(c);
  return c.json({ ok: true });
});
app.post('/json', async (c) =>
  c.json(
    parseRequest(z.strictObject({ value: z.string().nullable().optional() }), await jsonBody(c)),
  ),
);
app.get('/server-error', () => {
  throw new Error('private body, email@example.invalid and SQL parameters');
});

test('request schema failures are400, with valid null/omitted input intact', async () => {
  for (const body of ['{', '{"unknown":1}', '{"value":123}'])
    assert.equal(
      (
        await app.request('/json', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      ).status,
      400,
    );
  for (const body of ['{}', '{"value":null}']) {
    const response = await app.request('/json', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), JSON.parse(body));
  }
  assert.equal(
    (
      await app.request('/json?field=x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await app.request('/json', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      })
    ).status,
    400,
  );
});
test('all route groups use decimal limit, strict bool/null/filter decoding', async () => {
  for (const query of [
    'limit=1&limit=2',
    'limit=1e2',
    'limit=-1',
    'limit=201',
    'archived=1',
    'filters=bad',
    'unknown=1',
  ])
    assert.equal((await app.request('/query?' + query)).status, 400, query);
  const response = await app.request(
    '/query?limit=2&favoriteOnly=true&assigneeId=null&filters=%5B%5D',
  );
  assert.equal(response.status, 200);
  const input = await response.json();
  assert.equal(input.limit, 2);
  assert.equal(input.favoriteOnly, true);
  assert.equal(input.assigneeId, null);
  assert.deepEqual(input.filters, []);
  assert.equal((await app.request('/empty', { method: 'PUT', body: '{}' })).status, 400);
});
test('actual streamed bytes are bounded without trusting Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(9));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readRequestBytes(
      new Request('http://local/', { method: 'POST', body: stream, duplex: 'half' }),
      8,
    ),
    (error) => error.code === 'PAYLOAD_TOO_LARGE',
  );
  assert.equal(cancelled, true);
  assert.equal(
    (await readRequestBytes(new Request('http://local/', { method: 'POST', body: 'abc' }), 8))
      .length,
    3,
  );
});
test('server log has correlation fields and never logs the error payload', async () => {
  const logs = [],
    original = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const response = await app.request('/server-error', {
      headers: { 'x-request-id': 'attacker raw payload' },
    });
    assert.equal(response.status, 500);
    const id = response.headers.get('x-request-id');
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.notEqual(id, 'attacker raw payload');
    assert.equal(logs[0][1].requestId, id);
    assert.deepEqual(Object.keys(logs[0][1]).sort(), [
      'durationMs',
      'errorCode',
      'errorType',
      'operation',
      'phase',
      'requestId',
    ]);
    assert(!JSON.stringify(logs).includes('email@example.invalid'));
  } finally {
    console.error = original;
  }
});
