import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { returnPath } from '../../src/modules/auth/domain/oidc-browser.ts';
import { createLoginCrypto } from '../../src/modules/auth/storage/login-crypto.ts';
import { csrfProof, requireCookieCsrf, checkedCookie } from '../../src/modules/auth/http/csrf.ts';
test('browser return paths reject encoded, external, control and auth-loop ambiguity', () => {
  for (const value of [
    'https://foreign.invalid',
    '//foreign.invalid',
    '/auth/callback',
    '/login',
    '/%2f%2fforeign',
    '/w/%25',
    '/w/a\\b',
    '/\n',
    '/w/../auth/callback',
  ])
    assert.throws(() => returnPath(value));
  assert.equal(returnPath(null), '/');
  const path = '/w/01a11abd-aa80-7000-8000-000000000099/tasks?mode=list';
  assert.equal(returnPath(path), path);
});
test('login AEAD binds transaction and configured app scope; nonce and verifier never plaintext', async () => {
  const settings = {
      environment: 'unit',
      origin: 'https://datamaker-task.demo',
      issuer: 'https://identity-service.demo/api/auth',
      clientId: 'task8-fixture',
      keyset: { active: 'initial', keys: { initial: randomBytes(32).toString('base64url') } },
    },
    crypto = createLoginCrypto(settings);
  const secret = {
    nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
  };
  const envelope = await crypto.seal('transaction-a', secret);
  assert(!envelope.includes(secret.nonce) && !envelope.includes(secret.verifier));
  assert.deepEqual(await crypto.open('transaction-a', envelope), secret);
  await assert.rejects(crypto.open('transaction-b', envelope));
  await assert.rejects(
    createLoginCrypto({ ...settings, clientId: 'suite-fixture' }).open('transaction-a', envelope),
  );
  const changed = JSON.parse(envelope);
  changed.ciphertext = changed.ciphertext.slice(0, -4) + 'AAAA';
  await assert.rejects(crypto.open('transaction-a', JSON.stringify(changed)));
});
test('CSRF proof requires one owned opaque cookie and matching session-bound value', async () => {
  const sid = randomBytes(32).toString('base64url'),
    other = randomBytes(32).toString('base64url'),
    name = '__Host-task8_oidc_session',
    proof = await csrfProof(sid);
  const request = (cookie) =>
    new Request('https://datamaker-task.demo/api/v1/profile', {
      method: 'PATCH',
      headers: { cookie, 'x-csrf-token': proof },
    });
  await requireCookieCsrf(request(name + '=' + sid), name);
  await assert.rejects(requireCookieCsrf(request(name + '=' + other), name));
  await assert.rejects(requireCookieCsrf(request(''), name));
  assert.throws(() => checkedCookie(request(name + '=' + sid + '; ' + name + '=' + sid), name));
  assert.throws(() => checkedCookie(request(name + '=malformed'), name));
});
