import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createHttpClient } from '../../src/data/adapters/http.ts';
import { createHttpAuth } from '../../src/data/auth.ts';
import { queryKeys } from '../../src/data/query-keys.ts';
import { StudioApiError } from '../../src/data/errors.ts';

test('HTTP auth uses typed operations, tags session intent from Query and never caches credentials; failed logout remains retryable', async () => {
  const mock = createMockClient({ environment: 'test' });
  const local = await mock.execute('getSession', {});
  const session = {
    data: {
      ...local.data,
      currentWorkspaceId: null,
      capabilities: {
        ...local.data.capabilities,
        dataMode: 'http',
        identityMode: 'ict24h',
        features: { ...local.data.capabilities.features, authentication: 'implemented' },
      },
      authSession: {
        id: local.data.currentWorkspaceId,
        accessExpiresAt: '2030-01-01T00:30:00.000Z',
        expiresAt: '2030-01-15T00:00:00.000Z',
      },
    },
  };
  const cache = new QueryClient();
  const calls: { path: string; expected: string | null }[] = [];
  let failLogout = true;
  const client = createHttpClient({
    auth: () => auth,
    expectedSessionId: () => auth.expectedSessionId(),
    fetch: async (input, init) => {
      const path = String(input);
      calls.push({ path, expected: new Headers(init?.headers).get('X-Task8-Session-Id') });
      if (path.endsWith('/logout'))
        return new Response(
          JSON.stringify(
            failLogout
              ? { error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Unavailable' } }
              : { data: { signedOut: true } },
          ),
          { status: failLogout ? 503 : 200 },
        );
      if (path.endsWith('/workspaces')) return Response.json({ data: [] });
      return Response.json(session);
    },
  });
  const auth = createHttpAuth(client, async () =>
    Response.json({ mode: 'ict24h', csrf: 'controlled-session-proof' }),
  );
  auth.connect(cache);
  const password = 'test-only-private-password';
  await auth.login({ email: 'person@example.invalid', password, remember: false });
  assert.equal(calls[0]?.expected, null);
  assert.equal(auth.expectedSessionId(), session.data.authSession.id);
  assert.equal(cache.getMutationCache().getAll().length, 0);
  assert(
    !JSON.stringify(
      cache
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ).includes(password),
  );
  await auth.refresh();
  assert.equal(calls.at(-1)?.expected, session.data.authSession.id);
  await assert.rejects(
    auth.logout(),
    (error) => error instanceof StudioApiError && error.status === 503,
  );
  assert.deepEqual(cache.getQueryData(queryKeys.session()), session);
  failLogout = false;
  await auth.logout();
  assert.equal(cache.getQueryCache().getAll().length, 0);
});
