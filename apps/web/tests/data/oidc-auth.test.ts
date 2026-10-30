import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createHttpClient } from '../../src/data/adapters/http.ts';
import { createHttpAuth } from '../../src/data/auth.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import { queryKeys } from '../../src/data/query-keys.ts';
async function session() {
  const local = await createMockClient({ environment: 'test' }).execute('getSession', {});
  return {
    data: {
      ...local.data,
      capabilities: {
        ...local.data.capabilities,
        dataMode: 'http' as const,
        identityMode: 'oidc' as const,
        features: { ...local.data.capabilities.features, authentication: 'implemented' as const },
      },
      authSession: {
        id: '01a11abd-aa80-7000-8000-000000000090',
        accessExpiresAt: '2030-01-01T00:05:00.000Z',
        expiresAt: '2030-01-01T08:00:00.000Z',
      },
    },
  };
}
test('OIDC anonymous401 never tries legacy refresh or password login', async () => {
  const calls: string[] = [];
  const client = createHttpClient({
    auth: () => auth,
    fetch: async (input) => {
      calls.push(String(input));
      return Response.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401 },
      );
    },
  });
  const auth = createHttpAuth(client, async () => Response.json({ mode: 'oidc', csrf: null }));
  await assert.rejects(
    client.execute('getSession', {}),
    (error) => error instanceof StudioApiError && error.status === 401,
  );
  await assert.rejects(
    auth.login({
      email: 'fixture@example.invalid',
      password: 'controlled-only-password',
      remember: true,
    }),
    (error) => error instanceof StudioApiError && error.status === 501,
  );
  assert.deepEqual(calls, ['/api/v1/session']);
});
test('metadata503 remains retryable and cannot select a legacy fallback', async () => {
  let unavailable = true,
    metadataCalls = 0,
    operationCalls = 0;
  const client = createHttpClient({
    fetch: async () => {
      operationCalls++;
      throw new Error('No operation expected');
    },
  });
  const auth = createHttpAuth(client, async () => {
    metadataCalls++;
    return unavailable
      ? Response.json(
          { error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Unavailable' } },
          { status: 503 },
        )
      : Response.json({ mode: 'oidc', csrf: null });
  });
  await assert.rejects(
    auth.metadata(),
    (error) => error instanceof StudioApiError && error.status === 503,
  );
  assert.equal(operationCalls, 0);
  unavailable = false;
  assert.equal((await auth.metadata()).mode, 'oidc');
  assert.equal(metadataCalls, 2);
});
test('OIDC refresh checks current session through GET and local logout clears actor caches without provider redirects', async () => {
  const value = await session(),
    operations: string[] = [],
    authPaths: string[] = [],
    cache = new QueryClient();
  const client = createHttpClient({
    auth: () => auth,
    fetch: async (input) => {
      operations.push(String(input));
      return Response.json(value);
    },
  });
  const auth = createHttpAuth(client, async (input, init) => {
    authPaths.push(String(input));
    if (String(input) === '/auth/logout') {
      assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), 'controlled-session-proof');
      assert.deepEqual(JSON.parse(String(init?.body)), { provider: false });
      return Response.json({ redirect: null });
    }
    return Response.json({
      mode: 'oidc',
      csrf: String(input) === '/auth/context' ? 'controlled-session-proof' : null,
    });
  });
  auth.connect(cache);
  cache.setQueryData(queryKeys.session(), value);
  cache.setQueryData(['workspace', 'old-actor'], { private: 'old actor data' });
  assert.equal((await auth.refresh()).user.id, value.data.user.id);
  assert.deepEqual(operations, ['/api/v1/session']);
  const generation = auth.generation;
  await auth.logout();
  assert.equal(auth.generation, generation + 1);
  assert.equal(cache.getQueryCache().getAll().length, 0);
  assert(authPaths.includes('/auth/logout'));
  assert(!operations.some((path) => path.includes('/auth/')));
});
