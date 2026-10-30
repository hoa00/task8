import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHttpClient } from '../../src/data/adapters/http.ts';
import { createHttpAuth } from '../../src/data/auth.ts';
import { captureIntent } from '../../src/data/operations.ts';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createStudioQueryClient, studioQueryOptions } from '../../src/data/queries.ts';
import { queryKeys } from '../../src/data/query-keys.ts';
import { safeReturnPath } from '../../src/app/auth-navigation.ts';
import { StudioApiError } from '../../src/data/errors.ts';

async function fixture(fetcher: typeof fetch) {
  const cache = createStudioQueryClient();
  const client = createHttpClient({ fetch: fetcher, auth: () => auth });
  const auth = createHttpAuth(client, async () =>
    Response.json({ mode: 'ict24h', csrf: 'controlled-session-proof' }),
  );
  auth.connect(cache);
  return { cache, client, auth };
}
const unauthorized = () =>
  Response.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
    { status: 401 },
  );
async function session() {
  const mock = createMockClient({ environment: 'test' }),
    local = await mock.execute('getSession', {});
  return {
    data: {
      ...local.data,
      capabilities: {
        ...local.data.capabilities,
        dataMode: 'http',
        identityMode: 'ict24h',
        features: {
          ...local.data.capabilities.features,
          authentication: 'implemented',
        },
      },
      authSession: {
        id: '01a11abd-aa80-7000-8000-000000000090',
        accessExpiresAt: '2030-01-01T00:30:00.000Z',
        expiresAt: '2030-01-15T00:00:00.000Z',
      },
    },
  };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Uninitialized deferred');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

test('expired-access startup refreshes once before GET retry; concurrent reads share the same refresh', async () => {
  const value = await session(),
    release = deferred<void>(),
    started = deferred<void>();
  let renewed = false,
    refreshes = 0;
  const { client, cache } = await fixture(async (input) => {
    const path = String(input);
    if (path.endsWith('/refresh')) {
      refreshes++;
      started.resolve();
      await release.promise;
      renewed = true;
      return Response.json(value);
    }
    if (!renewed) return unauthorized();
    return Response.json(path.endsWith('/session') ? value : { data: value.data.user });
  });
  const a = client.execute('getSession', {}),
    b = client.execute('getProfile', {});
  await started.promise;
  release.resolve();
  const [first, second] = await Promise.all([a, b]);
  assert.equal(first.data.authSession?.id, value.data.authSession.id);
  assert.equal(second.data.id, value.data.user.id);
  assert.equal(refreshes, 1);
  cache.clear();
});

test('refresh503 is not automatically retried by Query and never clears the active session', async () => {
  const value = await session();
  let reads = 0,
    refreshes = 0;
  const { client, cache } = await fixture(async (input) => {
    if (String(input).endsWith('/refresh')) {
      refreshes++;
      return Response.json(
        { error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Unavailable' } },
        { status: 503 },
      );
    }
    reads++;
    return unauthorized();
  });
  cache.setQueryData(queryKeys.session(), value);
  await assert.rejects(
    cache.fetchQuery(studioQueryOptions(client, 'getProfile', {})),
    (error) => error instanceof StudioApiError && error.status === 503,
  );
  assert.equal(reads, 1);
  assert.equal(refreshes, 1);
  assert.deepEqual(cache.getQueryData(queryKeys.session()), value);
  cache.clear();
});

test('business mutation401 is never refreshed or replayed and preserves its original input', async () => {
  const value = await session();
  let calls = 0;
  const { client, cache } = await fixture(async () => {
    calls++;
    return unauthorized();
  });
  cache.setQueryData(queryKeys.session(), value);
  const input = {
    body: { name: 'Preserved draft', expectedVersion: value.data.user.version },
  };
  await assert.rejects(
    client.execute('updateProfile', input),
    (error) => error instanceof StudioApiError && error.status === 401,
  );
  assert.equal(calls, 1);
  assert.equal(input.body.name, 'Preserved draft');
  cache.clear();
});

test('old uncooperative GET and captured upload intent cannot enter a new account or cache after logout', async () => {
  const value = await session(),
    release = deferred<Response>(),
    started = deferred<void>();
  let uploads = 0;
  const { client, auth, cache } = await fixture(async (input) => {
    const path = String(input);
    if (path.endsWith('/logout')) return Response.json({ data: { signedOut: true } });
    if (path.includes('/files')) {
      uploads++;
      return Response.json({});
    }
    started.resolve();
    return release.promise;
  });
  cache.setQueryData(queryKeys.session(), value);
  const scope = captureIntent(client),
    old = client.execute('getProfile', {});
  await started.promise;
  await auth.logout();
  release.resolve(Response.json({ data: value.data.user }));
  await assert.rejects(
    old,
    (error) => error instanceof StudioApiError && error.detail.code === 'SESSION_CHANGED',
  );
  await assert.rejects(
    scope.execute('uploadProjectFile', {
      workspaceId: value.data.currentWorkspaceId ?? '',
      projectId: value.data.currentWorkspaceId ?? '',
      body: {
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        file: {
          name: 'kept.bin',
          mimeType: 'application/octet-stream',
          bytes: new Uint8Array([1]),
        },
      },
    }),
    (error) => error instanceof StudioApiError && error.detail.code === 'SESSION_CHANGED',
  );
  assert.throws(
    () => scope.assertIntent?.(),
    (error) => error instanceof StudioApiError && error.detail.code === 'SESSION_CHANGED',
  );
  assert.equal(uploads, 0);
  assert.equal(cache.getQueryCache().getAll().length, 0);
  cache.clear();
});

test('return paths reject external/backslash/protocol URLs and allow scoped internal navigation', () => {
  for (const value of [
    'https://foreign.invalid',
    '//foreign.invalid',
    '/\\foreign.invalid',
    'javascript:alert(1)',
    '/login',
  ])
    assert.equal(safeReturnPath(value), undefined);
  assert.equal(
    safeReturnPath('/w/01a11abd-aa80-7000-8000-000000000090/tasks?taskId=a'),
    '/w/01a11abd-aa80-7000-8000-000000000090/tasks?taskId=a',
  );
});

test('late unauthorized GET cannot refresh the new generation after logout', async () => {
  const value = await session(),
    release = deferred<Response>(),
    started = deferred<void>();
  let refreshes = 0;
  const { client, auth, cache } = await fixture(async (input) => {
    const path = String(input);
    if (path.endsWith('/logout')) return Response.json({ data: { signedOut: true } });
    if (path.endsWith('/refresh')) {
      refreshes++;
      return unauthorized();
    }
    started.resolve();
    return release.promise;
  });
  cache.setQueryData(queryKeys.session(), value);
  const old = client.execute('getProfile', {});
  await started.promise;
  await auth.logout();
  release.resolve(unauthorized());
  await assert.rejects(
    old,
    (error) => error instanceof StudioApiError && error.detail.code === 'SESSION_CHANGED',
  );
  assert.equal(refreshes, 0);
  assert.equal(cache.getQueryCache().getAll().length, 0);
  cache.clear();
});
