import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createSessionCrypto } from '../../src/modules/auth/storage/crypto.ts';
import {
  authSettings,
  requireOrigin,
  sessionCookie,
} from '../../src/modules/auth/http/settings.ts';
const id = '01a11abd-aa80-7000-8000-000000000099';
test('AES-GCM authenticates nonce/session/kind/version and uses fresh nonce and opaque hashed SID', async () => {
  const secret = randomBytes(32).toString('base64url');
  const crypto = createSessionCrypto(secret);
  const token = 'opaque-credential';
  const a = await crypto.encrypt(token, id, 'access', 1);
  const b = await crypto.encrypt(token, id, 'access', 1);
  assert.notEqual(a, b);
  assert(!a.includes(token));
  assert.equal(await crypto.decrypt(a, id, 'access', 1), token);
  for (const [value, session, kind, version] of [
    [a, id, 'refresh', 1],
    [a, id, 'access', 2],
    [a, '01a11abd-aa80-7000-8000-000000000098', 'access', 1],
    [a.slice(0, -4) + 'AAAA', id, 'access', 1],
  ])
    await assert.rejects(
      crypto.decrypt(value, session, kind, version),
      (error) => error.code === 'UNAUTHENTICATED',
    );
  await assert.rejects(
    createSessionCrypto(randomBytes(32).toString('base64url')).decrypt(a, id, 'access', 1),
  );
  const sid = crypto.newSid();
  assert.equal(sid.length, 43);
  assert.match(await crypto.hashSid(sid), /^[a-f0-9]{64}$/);
  assert.notEqual(await crypto.hashSid(sid), sid);
  assert.throws(() => createSessionCrypto('short'));
  assert.throws(() => createSessionCrypto(secret + '='));
});
test('Origin and cookies use exact trusted configuration; HTTP only loopback local and no refresh cookie policy', () => {
  const env = {
    AUTH_MODE: 'ict24h',
    AUTH_PROVIDER_KEY: 'ict24h-identity',
    AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
    AUTH_TENANT_ID: 'ict24h-rdn-dev',
    AUTH_PUBLIC_KEY: 'test-public-key',
    AUTH_SESSION_ENCRYPTION_KEY: 'test-key',
    AUTH_APP_ORIGIN: 'https://task8.example.invalid',
  };
  const settings = authSettings(env);
  assert.equal(settings.cookieName, '__Host-task8_session');
  assert.match(
    sessionCookie('opaque', settings, true, 100000, 0),
    /HttpOnly; SameSite=Lax; Secure; Max-Age=100/,
  );
  assert(!sessionCookie('opaque', settings, false, 100000, 0).includes('Max-Age'));
  requireOrigin(
    new Request(env.AUTH_APP_ORIGIN, { headers: { origin: env.AUTH_APP_ORIGIN } }),
    settings,
  );
  assert.throws(() =>
    requireOrigin(
      new Request(env.AUTH_APP_ORIGIN, { headers: { origin: 'https://foreign.example.invalid' } }),
      settings,
    ),
  );
  assert.throws(() =>
    authSettings({ ...env, AUTH_APP_ORIGIN: 'http://example.invalid', STUDIO_ENV: 'local' }),
  );
  assert.throws(() => authSettings({ ...env, AUTH_APP_ORIGIN: 'http://127.0.0.1:8787' }));
  assert.equal(
    authSettings({ ...env, AUTH_APP_ORIGIN: 'http://127.0.0.1:8787', STUDIO_ENV: 'local' })
      .secureCookie,
    false,
  );
});
