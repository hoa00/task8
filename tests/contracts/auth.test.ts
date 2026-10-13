import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthLoginInputSchema, ApiErrorSchema, Ict24hSessionSchema, SessionSchema, authOperations, errorHttpStatus } from '../../packages/contracts/src/api.ts';
import { capabilities, user, ids } from './fixtures.ts';

test('canonical and standalone ICT24H sessions admit waiting users with metadata', () => {
  const local = { user, currentWorkspaceId: ids.workspaceId, capabilities,authSession:null };
  assert.ok(SessionSchema.safeParse(local).success);
  assert.equal(SessionSchema.safeParse({ ...local, currentWorkspaceId: null }).success, false);
  const session = { user, currentWorkspaceId: null, capabilities: { ...capabilities, dataMode: 'http', identityMode: 'ict24h', features: { ...capabilities.features, authentication: 'implemented' } }, authSession: { id: ids.workspaceId, accessExpiresAt: '2030-01-01T00:30:00.000Z', expiresAt: '2030-01-15T00:00:00.000Z' } };
  assert.deepEqual(Ict24hSessionSchema.parse(session), session);
  assert.deepEqual(SessionSchema.parse(session),session);
  assert.equal(Ict24hSessionSchema.safeParse({ ...session, authSession: null }).success, false);
  assert.equal(Ict24hSessionSchema.safeParse({ ...session, capabilities }).success, false);
  assert.deepEqual(authOperations.authLogin.response.parse({ data: session }), { data: session });
  assert.equal(authOperations.authRefresh.request.safeParse({ refreshToken: 'never-from-browser' }).success, false);
  assert.equal(authOperations.authLogout.data.safeParse({ signedOut: true }).success, true);
});

test('login input rejects unknown fields, invalid email and oversized UTF8 passwords', () => {
  const valid = { email: 'test@example.invalid', password: 'six-or-more', remember: true };
  assert.deepEqual(AuthLoginInputSchema.parse(valid), valid);
  for (const input of [{ ...valid, tenant: 'untrusted' }, { ...valid, email: 'bad' }, { ...valid, password: 'short' }, { ...valid, password: '😀'.repeat(257) }, { ...valid, remember: 'true' }])
    assert.equal(AuthLoginInputSchema.safeParse(input).success, false);
});

test('new auth errors share the canonical status map', () => {
  for (const [code, status] of [['SESSION_CHANGED', 409], ['AUTH_SERVICE_UNAVAILABLE', 503]] as const) {
    assert.equal(ApiErrorSchema.safeParse({ error: { code, message: 'Safe public error' } }).success, true);
    assert.equal(errorHttpStatus[code], status);
  }
});
