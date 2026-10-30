import assert from 'node:assert/strict';
import { mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHarness, localFetch } from '../support/harness.mjs';
import { createControlledIdentityProvider } from '../support/identity-provider.mjs';
const report = {
    status: 'RUNNING',
    commands: [],
    probes: [],
    layer: 'W Task8 native Workerd/D1; F controlled legacy provider, not live ICT24H',
  },
  h = await createHarness('auth-session', report),
  provider = await createControlledIdentityProvider();
try {
  await mkdir(h.persist, { recursive: true, mode: 0o700 });
  const backup = resolve(h.runtime, 'before-schema-and-fixture');
  await cp(h.persist, backup, { recursive: true });
  report.backup = { path: backup, empty: true };
  h.run('migrate', [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    h.persist,
  ]);
  await h.start(
    'explicit-legacy',
    {
      AUTH_MODE: 'ict24h',
      AUTH_PROVIDER_KEY: 'ict24h-identity',
      AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
      AUTH_TENANT_ID: provider.tenant,
      AUTH_APP_ORIGIN: h.baseUrl,
      AUTH_PUBLIC_KEY: provider.publicKey,
      TEST_PROVIDER_URL: provider.providerUrl,
    },
    false,
    { AUTH_SESSION_ENCRYPTION_KEY: provider.secret },
  );
  const signed = await localFetch(h.baseUrl + '/api/v1/auth/login', {
    method: 'POST',
    headers: { origin: h.baseUrl, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: provider.accounts[0].email,
      password: 'correct-password',
      remember: false,
    }),
  });
  assert.equal(signed.status, 200);
  const legacyCookie = signed.headers.get('set-cookie').split(';')[0],
    sid = legacyCookie.slice(legacyCookie.indexOf('=') + 1);
  const request = async (name, headers, expected) => {
    const response = await localFetch(h.baseUrl + '/__auth/current', {
      headers: { origin: h.baseUrl, ...headers },
    });
    report.probes.push({ name, status: response.status });
    assert.equal(response.status, expected);
  };
  await request('explicit-legacy-correct-cookie', { cookie: legacyCookie }, 200);
  await request(
    'same-valid-legacy-secret-under-oidc-cookie-rejected',
    { cookie: '__Host-task8_oidc_session=' + sid },
    401,
  );
  await request(
    'same-valid-legacy-secret-under-suite-cookie-rejected',
    { cookie: '__Host-suite_session=' + sid },
    401,
  );
  await request(
    'same-valid-legacy-secret-as-bearer-rejected',
    { authorization: 'Bearer ' + sid },
    401,
  );
  await request(
    'duplicate-legacy-cookies-rejected',
    { cookie: legacyCookie + '; ' + legacyCookie },
    401,
  );
  const current = await localFetch(h.baseUrl + '/api/v1/session', {
      headers: { origin: h.baseUrl, cookie: legacyCookie },
    }),
    data = await current.json();
  assert.equal(current.status, 200);
  assert.equal(data.data.capabilities.identityMode, 'ict24h');
  report.probes.push({ name: 'legacy-dto-retains-explicit-mode', status: 200 });
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = { name: error.name, code: error.code ?? null };
  process.exitCode = 1;
} finally {
  await h.cleanup();
  await provider.close();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      report: h.out + '/report.json',
    }),
  );
}
