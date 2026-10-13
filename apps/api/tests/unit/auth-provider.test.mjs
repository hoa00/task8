import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { createIdentityProvider } from '../../src/modules/auth/http/provider.ts';
import { providerConfig } from '../../src/modules/auth/http/config.ts';
import { mapError } from '../../src/http/error-handler.ts';

const config = { baseUrl: 'https://identity.example.invalid', tenantId: 'ict24h-rdn-dev' };
const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@example.invalid',
  srv_t: config.tenantId,
  fullname: 'Test User',
};
const tokens = {
  access: { token: 'controlled-access-fixture', expires: '2030-01-01T00:30:00.000Z' },
  refresh: { token: 'controlled-refresh-fixture', expires: '2030-01-15T00:00:00.000Z' },
};
const clock = { now: () => Date.parse('2030-01-01T00:00:00.000Z') };
const credentials = { email: profile.email, password: 'test-only-password' };
const success = (data) => ({ statusCode: 200, message: 'success', data });
const failure = (statusCode) => ({
  statusCode,
  message: 'error',
  error: [{ message: 'Private upstream error' }],
});
const json = (body, status = 201) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
const provider = (response) =>
  createIdentityProvider(config, { clock, fetch: async () => response });
const rejects = async (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes('Private'));
    return true;
  });

test('provider keeps distinct login, refresh and whoami envelopes and paths', async () => {
  const requests = [];
  const api = createIdentityProvider(config, {
    clock,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/login'))
        return json(success({ user: { ...profile, password: 'ignored' }, tokens }));
      if (url.endsWith('/refresh-token')) return json(success(tokens));
      return json(success(profile), 200);
    },
  });
  assert.deepEqual(await api.login(credentials), { user: profile, tokens });
  assert.deepEqual(await api.refresh(tokens.refresh.token), tokens);
  assert.deepEqual(await api.whoami(tokens.access.token), profile);
  assert.deepEqual(
    requests.map((item) => item.url),
    [
      config.baseUrl + '/v1/auth/login',
      config.baseUrl + '/v1/auth/refresh-token',
      config.baseUrl + '/v1/user/whoami',
    ],
  );
  assert.deepEqual(JSON.parse(requests[0].init.body), credentials);
  assert.deepEqual(JSON.parse(requests[1].init.body), { refreshToken: tokens.refresh.token });
  assert.equal(requests[2].init.body, undefined);
  assert.equal(requests[2].init.headers.authorization, 'Bearer ' + tokens.access.token);
  for (const { init } of requests) {
    assert.equal(init.headers['i24h-tenant'], config.tenantId);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('HTTP201 with body400 is rejected for both credential routes', async () => {
  await rejects(provider(json(failure(400))).login(credentials), 'UNAUTHENTICATED');
  await rejects(provider(json(failure(400))).refresh(tokens.refresh.token), 'UNAUTHENTICATED');
});

test('malformed success, contradictory errors and wrong envelope are service failures', async () => {
  for (const body of [
    success(tokens),
    success({ user: profile, tokens: {} }),
    { ...success({ user: profile, tokens }), error: null },
    { ...success({ user: profile, tokens }), message: 'error' },
    null,
    [],
    { statusCode: 200, message: 'success' },
  ])
    await rejects(provider(json(body)).login(credentials), 'AUTH_SERVICE_UNAVAILABLE');
  await rejects(
    provider(json(success({ user: profile, tokens }))).refresh(tokens.refresh.token),
    'AUTH_SERVICE_UNAVAILABLE',
  );
  await rejects(
    provider(json(success({ user: profile }))).whoami(tokens.access.token),
    'AUTH_SERVICE_UNAVAILABLE',
  );
  await rejects(
    provider(json(success({ user: profile, tokens }), 401)).login(credentials),
    'AUTH_SERVICE_UNAVAILABLE',
  );
});

test('provider outage, throttling and network exceptions never become bad passwords', async () => {
  for (const status of [429, 500, 503])
    await rejects(
      provider(json(failure(400), status)).login(credentials),
      'AUTH_SERVICE_UNAVAILABLE',
    );
  const api = createIdentityProvider(config, {
    clock,
    fetch: async () => {
      throw new Error('Private network exception');
    },
  });
  await rejects(api.login(credentials), 'AUTH_SERVICE_UNAVAILABLE');
});

test('deadline aborts the upstream request once without a retry', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const api = createIdentityProvider(config, {
    clock,
    fetch: async (_url, init) => {
      attempts++;
      return new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(new Error('Private timeout')), {
          once: true,
        }),
      );
    },
  });
  const pending = api.login(credentials);
  context.mock.timers.tick(10000);
  await rejects(pending, 'AUTH_SERVICE_UNAVAILABLE');
  assert.equal(attempts, 1);
});

test('token expiries, byte bounds, central identity shape and tenant fail closed', async () => {
  for (const altered of [
    { ...tokens, access: { ...tokens.access, expires: '2030-01-01T00:00:00.000Z' } },
    { ...tokens, refresh: { ...tokens.refresh, expires: 'invalid' } },
    { ...tokens, access: { ...tokens.access, token: '😀'.repeat(5000) } },
  ])
    await rejects(
      provider(json(success(altered))).refresh(tokens.refresh.token),
      'AUTH_SERVICE_UNAVAILABLE',
    );
  await rejects(
    provider(json(success({ ...profile, id: 'not-a-uuid' }), 200)).whoami(tokens.access.token),
    'AUTH_SERVICE_UNAVAILABLE',
  );
  await rejects(
    provider(json(success({ ...profile, srv_t: 'foreign' }), 200)).whoami(tokens.access.token),
    'UNAUTHENTICATED',
  );
  await rejects(
    provider(json(success({ user: { ...profile, srv_t: 'foreign' }, tokens }))).login(credentials),
    'UNAUTHENTICATED',
  );
  await rejects(provider(json(failure(404), 404)).whoami(tokens.access.token), 'UNAUTHENTICATED');
});

test('response bytes are capped on the stream even without Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(65537));
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = new Response(stream, { headers: { 'content-type': 'application/json' } });
  await rejects(provider(response).login(credentials), 'AUTH_SERVICE_UNAVAILABLE');
  assert.equal(cancelled, true);
  for (const response of [
    new Response('html', { headers: { 'content-type': 'text/html' } }),
    new Response('{bad json', { headers: { 'content-type': 'application/json' } }),
    new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', {
      headers: { 'content-type': 'application/json', 'content-length': '65537' },
    }),
  ])
    await rejects(provider(response).login(credentials), 'AUTH_SERVICE_UNAVAILABLE');
});

test('provider config rejects unsafe setup and preserves tenant matching', () => {
  assert.deepEqual(providerConfig(config), config);
  for (const baseUrl of [
    'http://identity.example.invalid',
    'https://user:pass@identity.example.invalid',
    'https://identity.example.invalid/?q=1',
    'https://identity.example.invalid/#secret',
  ])
    assert.throws(
      () => providerConfig({ ...config, baseUrl }),
      /Invalid identity provider configuration/,
    );
  for (const tenantId of ['', ' padded ', 'tenant\r\nInjected: value'])
    assert.throws(
      () => providerConfig({ ...config, tenantId }),
      /Invalid identity provider configuration/,
    );
});

test('HTTP maps auth errors without leaking upstream details or logging payloads', async (context) => {
  const logs = context.mock.method(console, 'error', () => {});
  const app = new Hono();
  app.onError(mapError);
  app.post('/login', async () => provider(json(failure(400))).login(credentials));
  app.post('/outage', async () => provider(json(failure(400), 503)).login(credentials));
  const rejected = await app.request('/login', { method: 'POST' });
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), {
    error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
  });
  const outage = await app.request('/outage', { method: 'POST' });
  assert.equal(outage.status, 503);
  assert.deepEqual(await outage.json(), {
    error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service is unavailable' },
  });
  assert.equal(logs.mock.callCount(), 0);
});
