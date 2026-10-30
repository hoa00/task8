import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { oidcSettings, oidcCookie } from '../../src/modules/auth/http/oidc-settings.ts';
import { requestSid, authSettings } from '../../src/modules/auth/http/settings.ts';
import { createOidcCrypto } from '../../src/modules/auth/storage/oidc-crypto.ts';
import { oidcPolicy } from '../../src/modules/auth/domain/oidc.ts';
import { checkBoundaries } from '../../tooling/import-boundaries.mjs';
import { CapabilitiesSchema } from '@studio/contracts/api';
const keys = {
  old: randomBytes(32).toString('base64url'),
  next: randomBytes(32).toString('base64url'),
};
const env = {
  AUTH_MODE: 'oidc',
  OIDC_ISSUER: 'https://identity-service.demo/api/auth',
  AUTH_APP_ORIGIN: 'https://datamaker-task.demo',
  OIDC_CLIENT_ID: 'fixture-task8',
  OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'),
  RP_ENVIRONMENT: 'unit',
  RP_TOKEN_ENCRYPTION_KEYSET: JSON.stringify({ active: 'old', keys }),
};
const settings = oidcSettings(env);
const binding = {
  id: '01a11abd-aa80-7000-8000-000000000099',
  linkId: '01a11abd-aa80-7000-8000-000000000098',
  issuer: env.OIDC_ISSUER,
  clientId: 'fixture-task8',
  subject: 'opaque|subject:ABC',
  providerSid: 'fixture-session',
};
test('OIDC config pins issuer/origin and refuses ambiguous modes or keysets', () => {
  for (const change of [
    { AUTH_MODE: 'ict24h' },
    { OIDC_ISSUER: env.OIDC_ISSUER + '/' },
    { AUTH_APP_ORIGIN: 'https://api.datamaker-task.demo' },
    { AUTH_APP_ORIGIN: 'http://datamaker-task.demo' },
    { RP_TOKEN_ENCRYPTION_KEYSET: '{}' },
    { RP_TOKEN_ENCRYPTION_KEYSET: JSON.stringify({ active: 'missing', keys }) },
    {
      RP_TOKEN_ENCRYPTION_KEYSET: JSON.stringify({ active: 'old', keys: { old: keys.old + '=' } }),
    },
  ])
    assert.throws(
      () => oidcSettings({ ...env, ...change }),
      (e) => e.code === 'AUTH_SERVICE_UNAVAILABLE',
    );
  assert.throws(() => authSettings(env));
  assert.equal(settings.cookieName, '__Host-task8_oidc_session');
  assert.deepEqual(oidcPolicy, {
    absolute: 28800,
    freshness: 300,
    access: 300,
    transaction: 600,
    tolerance: 60,
    recovery: 30,
    timeout: 5,
    lease: 10,
  });
});
test('only one correctly named opaque cookie is accepted', () => {
  const sid = randomBytes(32).toString('base64url');
  const req = (cookie) => new Request(env.AUTH_APP_ORIGIN, { headers: { cookie } });
  assert.equal(requestSid(req(settings.cookieName + '=' + sid), settings), sid);
  for (const cookie of [
    '__Host-task8_session=' + sid,
    '__Host-suite_session=' + sid,
    settings.cookieName + '=a.b.c',
    settings.cookieName + '=' + sid + '; ' + settings.cookieName + '=' + sid,
  ])
    assert.equal(requestSid(req(cookie), settings), undefined);
  const cookie = oidcCookie(sid, 28800000, 0);
  assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/);
  assert(!cookie.includes('Domain='));
  assert.match(oidcCookie(sid, 28800000, 28800001), /Max-Age=0$/);
});
test('AEAD binds app/environment/origin/session/link/issuer/client/original identity and supports key overlap', async () => {
  const seal = createOidcCrypto(settings),
    tokens = {
      access_token: randomBytes(32).toString('base64url'),
      refresh_token: randomBytes(32).toString('base64url'),
    };
  const first = await seal.seal(binding, tokens),
    second = await seal.seal(binding, tokens);
  assert.notEqual(first, second);
  assert(!first.includes(tokens.access_token));
  assert.deepEqual(await seal.open(binding, first), tokens);
  for (const field of Object.keys(binding))
    await assert.rejects(seal.open({ ...binding, [field]: binding[field] + 'x' }, first));
  for (const changes of [{ environment: 'elsewhere' }, { origin: 'https://foreign.invalid' }])
    await assert.rejects(createOidcCrypto({ ...settings, ...changes }).open(binding, first));
  const rotated = createOidcCrypto({ ...settings, keyset: { active: 'next', keys } });
  assert.deepEqual(await rotated.open(binding, first), tokens);
  assert.equal(JSON.parse(await rotated.seal(binding, tokens)).keyId, 'next');
  await assert.rejects(
    createOidcCrypto({ ...settings, keyset: { active: 'next', keys: { next: keys.next } } }).open(
      binding,
      first,
    ),
  );
  const data = JSON.parse(first);
  data.ciphertext = data.ciphertext.slice(0, -4) + 'AAAA';
  await assert.rejects(seal.open(binding, JSON.stringify(data)));
  await assert.rejects(seal.open(binding, JSON.stringify(tokens)));
  const sid = seal.newSid();
  assert.equal(sid.length, 43);
  assert.match(await seal.hashSid(sid), /^[a-f0-9]{64}$/);
  assert.notEqual(await seal.hashSid(sid), sid);
});
test('OIDC client libraries stay restricted to the explicit HTTP adapter', () => {
  const empty = { imports: [], cycles: [] };
  assert.equal(
    checkBoundaries(
      new Map([
        [
          'src/modules/auth/http/oidc-provider.ts',
          "import * as oidc from 'openid-client';import * as jose from 'jose';",
        ],
      ]),
      empty,
    ).status,
    'PASS',
  );
  for (const path of [
    'src/modules/auth/application/oidc-session.ts',
    'src/modules/tasks/http/routes.ts',
    'src/modules/auth/http/access.ts',
  ])
    for (const library of ['openid-client', 'jose'])
      assert.throws(() => checkBoundaries(new Map([[path, `import '${library}';`]]), empty));
  const capabilities = {
    dataMode: 'http',
    identityMode: 'oidc',
    features: {
      projects: 'implemented',
      tasks: 'implemented',
      teams: 'implemented',
      comments: 'implemented',
      notificationState: 'implemented',
      fileMetadata: 'implemented',
      fileBytes: 'implemented',
      workspaceProvisioning: 'unavailable',
      invitations: 'unavailable',
      projectSharing: 'unavailable',
      authentication: 'implemented',
      accountSecurity: 'unavailable',
      billing: 'unavailable',
    },
    limits: {
      taskPageSize: 50,
      maxTaskPageSize: 200,
      maxBulkItems: 20,
      maxUndoTargets: 128,
      maxUndoPayloadBytes: 65536,
      maxUploadBytes: 10485760,
    },
  };
  assert.equal(CapabilitiesSchema.parse(capabilities).identityMode, 'oidc');
  assert.equal(CapabilitiesSchema.safeParse({ ...capabilities, dataMode: 'mock' }).success, false);
  assert.equal(
    CapabilitiesSchema.safeParse({
      ...capabilities,
      features: { ...capabilities.features, authentication: 'unavailable' },
    }).success,
    false,
  );
});
