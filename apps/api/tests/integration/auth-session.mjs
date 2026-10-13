import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createControlledIdentityProvider } from '../support/identity-provider.mjs';
import { createHarness, localFetch } from '../support/harness.mjs';
import { authOperations } from '@studio/contracts/api';

const report = { status: 'RUNNING', commands: [], probes: [] };
const h = await createHarness('auth-session', report);
const { publicKey, secret, providerUrl, accounts, tenant, state, block, credentials, close } =
  await createControlledIdentityProvider();
async function request(
  name,
  path,
  status = 200,
  { cookie, expected, body, headers = {}, method } = {},
) {
  const response = await localFetch(h.baseUrl + path, {
    method: method ?? (path.includes('/auth/') ? 'POST' : 'GET'),
    headers: {
      origin: h.baseUrl,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(expected ? { 'X-Task8-Session-Id': expected } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  report.probes.push({ name, status: response.status });
  assert.equal(response.status, status, name + ' ' + JSON.stringify(data.error ?? {}));
  const text = JSON.stringify(data);
  assert(!text.includes('correct-password'));
  for (const value of credentials()) assert(!text.includes(value));
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const login = (name = 'login', opts = {}) =>
  request(name, '/api/v1/auth/login', opts.status ?? 200, {
    ...opts,
    body: {
      email: accounts[opts.account ?? 0].email,
      password: opts.password ?? 'correct-password',
      remember: opts.remember ?? false,
    },
  });
async function sql(query, parameters = []) {
  return (
    await request('native-sql-' + report.probes.length, '/__auth/sql', 200, {
      method: 'POST',
      body: { sql: query, parameters },
    })
  ).data.results;
}
try {
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
  const vars = {
    AUTH_MODE: 'ict24h',
    AUTH_PROVIDER_KEY: 'ict24h-identity',
    AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
    AUTH_TENANT_ID: tenant,
    AUTH_APP_ORIGIN: h.baseUrl,
    AUTH_PUBLIC_KEY: publicKey,
    TEST_PROVIDER_URL: providerUrl,
  };
  await h.start(
    'session',
    {
      AUTH_MODE: 'ict24h',
      AUTH_PROVIDER_KEY: 'ict24h-identity',
      AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
      AUTH_TENANT_ID: tenant,
      AUTH_APP_ORIGIN: h.baseUrl,
      AUTH_PUBLIC_KEY: publicKey,
      TEST_PROVIDER_URL: providerUrl,
    },
    false,
    { AUTH_SESSION_ENCRYPTION_KEY: secret },
  );
  await request('startup', '/health');
  state.redirectLogin = true;
  await login('Worker-rejects-upstream-redirect', { status: 503 });
  state.redirectLogin = false;
  await login('bad-credentials', { status: 401, password: 'wrong-password' });
  assert.equal((await sql('SELECT count(*) count FROM authSessions'))[0].count, 0);
  await request('bad-Origin', '/api/v1/auth/login', 403, {
    headers: { origin: 'https://foreign.example.invalid' },
    body: { email: accounts[0].email, password: 'correct-password', remember: false },
  });
  await request('oversized-login-stream', '/api/v1/auth/login', 413, {
    body: { password: 'x'.repeat(9000) },
  });
  const first = await login();
  authOperations.authLogin.response.parse(first.data);
  assert(first.cookie);
  assert.match(first.response.headers.get('set-cookie'), /HttpOnly/);
  assert(!first.response.headers.get('set-cookie').includes('Max-Age'));
  assert.equal(first.response.headers.get('X-Test-Primary'), 'true');
  assert.equal(first.data.data.currentWorkspaceId, null);
  const id = first.data.data.authSession.id;
  const [row] = await sql('SELECT * FROM authSessions WHERE id=?', [id]);
  assert.equal(row.sidHash.length, 64);
  assert(!row.sidHash.includes(first.cookie.split('=')[1]));
  assert(row.accessCiphertext.includes('.'));
  assert(row.refreshCiphertext.includes('.'));
  assert.notEqual(row.accessCiphertext.split('.')[0], row.refreshCiphertext.split('.')[0]);
  const current = await request('primary-authenticate', '/__auth/current', 200, {
    cookie: first.cookie,
  });
  assert.equal(current.data.primary, true);
  assert.equal(current.data.statements, 3);
  assert.equal(current.data.data.user.id, first.data.data.user.id);
  const version = row.tokenVersion;
  const renewed = await request('refresh-no-Set-Cookie', '/api/v1/auth/refresh', 200, {
    cookie: first.cookie,
    expected: id,
  });
  assert.equal(renewed.response.headers.get('set-cookie'), null);
  assert.equal(renewed.data.data.authSession.expiresAt, first.data.data.authSession.expiresAt);
  assert.equal(
    (await sql('SELECT tokenVersion FROM authSessions WHERE id=?', [id]))[0].tokenVersion,
    version + 1,
  );
  state.refreshUnavailable = true;
  const unavailable = await request('refresh-503-keeps-pair', '/api/v1/auth/refresh', 503, {
    cookie: first.cookie,
    expected: id,
  });
  assert.equal(unavailable.data.error.code, 'AUTH_SERVICE_UNAVAILABLE');
  state.refreshUnavailable = false;
  assert.equal(
    (await sql('SELECT revokedAt FROM authSessions WHERE id=?', [id]))[0].revokedAt,
    null,
  );
  const refreshBlock = block();
  state.blockRefresh = refreshBlock;
  const loser = request('concurrent-refresh-loser', '/api/v1/auth/refresh', 200, {
    cookie: first.cookie,
    expected: id,
  });
  await refreshBlock.ready;
  const winner = await request('concurrent-refresh-winner', '/api/v1/auth/refresh', 200, {
    cookie: first.cookie,
    expected: id,
  });
  refreshBlock.release();
  const losing = await loser;
  assert.deepEqual(losing.data, winner.data);
  const stale = block();
  stale.reject = true;
  state.blockRefresh = stale;
  const rejected = request(
    'stale-refresh-failure-does-not-revoke-winner',
    '/api/v1/auth/refresh',
    200,
    { cookie: first.cookie, expected: id },
  );
  await stale.ready;
  await request('new-pair-before-stale-failure', '/api/v1/auth/refresh', 200, {
    cookie: first.cookie,
    expected: id,
  });
  stale.release();
  await rejected;
  assert.equal(
    (await sql('SELECT revokedAt FROM authSessions WHERE id=?', [id]))[0].revokedAt,
    null,
  );
  const second = await login('second-account', {
    account: 1,
    cookie: first.cookie,
    remember: true,
  });
  assert.notEqual(second.cookie, first.cookie);
  assert.match(second.response.headers.get('set-cookie'), /Max-Age=/);
  assert(Date.parse(second.data.data.authSession.expiresAt) <= Date.now() + 14 * 86400000);
  const secondId = second.data.data.authSession.id;
  const calls = state.refreshCount;
  await request('cookie-S2-expected-S1-refresh', '/api/v1/auth/refresh', 409, {
    cookie: second.cookie,
    expected: id,
  });
  await request('cookie-S2-expected-S1-logout', '/api/v1/auth/logout', 409, {
    cookie: second.cookie,
    expected: id,
  });
  assert.equal(state.refreshCount, calls);
  assert.equal(
    (await sql('SELECT revokedAt FROM authSessions WHERE id=?', [secondId]))[0].revokedAt,
    null,
  );
  await request('old-SID-revoked', '/__auth/current', 401, { cookie: first.cookie });
  const lateRefresh = block();
  state.blockRefresh = lateRefresh;
  const late = request('late-refresh-after-logout', '/api/v1/auth/refresh', 401, {
    cookie: second.cookie,
    expected: secondId,
  });
  await lateRefresh.ready;
  const logout = await request('logout', '/api/v1/auth/logout', 200, {
    cookie: second.cookie,
    expected: secondId,
  });
  assert.equal(logout.response.headers.get('set-cookie'), null);
  lateRefresh.release();
  await late;
  await request('idempotent-logout', '/api/v1/auth/logout', 200, {
    cookie: second.cookie,
    expected: secondId,
  });
  await request('anonymous-logout', '/api/v1/auth/logout');
  await request('missing-SID-with-old-metadata-logout', '/api/v1/auth/logout', 200, {
    expected: secondId,
  });
  for (const [name, column, value] of [
    ['access-expired', 'accessExpiresAt', 1],
    ['refresh-expired', 'refreshExpiresAt', 1],
    ['absolute-expired', 'expiresAt', 1],
    ['ciphertext-tampered', 'accessCiphertext', 'bad-ciphertext'],
  ]) {
    const session = await login(name);
    await sql(`UPDATE authSessions SET ${column}=? WHERE id=?`, [
      value,
      session.data.data.authSession.id,
    ]);
    await request('logout-' + name, '/api/v1/auth/logout', 200, {
      cookie: session.cookie,
      expected: session.data.data.authSession.id,
    });
    const [revoked] = await sql('SELECT * FROM authSessions WHERE id=?', [
      session.data.data.authSession.id,
    ]);
    assert(revoked.revokedAt !== null);
    assert.equal(revoked.accessCiphertext, null);
    assert.equal(revoked.refreshCiphertext, null);
  }
  const tampered = await login('tamper-authentication');
  await sql('UPDATE authSessions SET accessCiphertext=? WHERE id=?', [
    'invalid',
    tampered.data.data.authSession.id,
  ]);
  await request('tampered-access-rejected', '/__auth/current', 401, { cookie: tampered.cookie });
  const mismatch = await login('identity-mismatch');
  state.mismatch = true;
  await request('refresh-identity-mismatch', '/api/v1/auth/refresh', 401, {
    cookie: mismatch.cookie,
  });
  state.mismatch = false;
  assert(
    (
      await sql('SELECT revokedAt FROM authSessions WHERE id=?', [
        mismatch.data.data.authSession.id,
      ])
    )[0].revokedAt !== null,
  );
  const deleted = await login('central-deletion');
  state.whoamiMissing = true;
  await request('whoami-user-deleted', '/api/v1/auth/refresh', 401, { cookie: deleted.cookie });
  state.whoamiMissing = false;
  const previous = await login('previous-for-late-login');
  const blocked = block();
  state.blockLogin = blocked;
  const delayed = login('late-login-after-logout', { cookie: previous.cookie, status: 409 });
  await blocked.ready;
  await request('revoke-previous-login', '/api/v1/auth/logout', 200, { cookie: previous.cookie });
  blocked.release();
  const result = await delayed;
  assert.equal(result.response.headers.get('set-cookie'), null);
  const old = await login('previous-for-account-switch');
  const switchBlock = block();
  state.blockLogin = switchBlock;
  const oldAttempt = login('late-login-after-account-switch', { cookie: old.cookie, status: 409 });
  await switchBlock.ready;
  const switched = await login('new-account-winner', { cookie: old.cookie, account: 1 });
  switchBlock.release();
  await oldAttempt;
  await request('new-account-remains-active', '/__auth/current', 200, { cookie: switched.cookie });
  const lost = await login('lost-login-acknowledgement-reconciled', {
    headers: { 'X-Test-DB': 'ack-loss' },
  });
  await request('reconciled-SID-active', '/__auth/current', 200, { cookie: lost.cookie });
  await request('logout-storage-failure', '/api/v1/auth/logout', 503, {
    cookie: lost.cookie,
    headers: { 'X-Test-DB': 'fail' },
  });
  await request('failed-logout-still-active', '/__auth/current', 200, { cookie: lost.cookie });
  await request('logout-storage-retry', '/api/v1/auth/logout', 200, { cookie: lost.cookie });
  const ackLogout = await login('logout-acknowledgement-loss');
  await request('logout-unknown-acknowledgement', '/api/v1/auth/logout', 503, {
    cookie: ackLogout.cookie,
    headers: { 'X-Test-DB': 'ack-loss' },
  });
  await request('logout-unknown-ack-idempotent-retry', '/api/v1/auth/logout', 200, {
    cookie: ackLogout.cookie,
  });
  const rotated = await login('key-rotation-session');
  await h.stopWorker();
  await h.start(
    'new-encryption-key',
    { ...vars, AUTH_PUBLIC_KEY: vars.AUTH_PUBLIC_KEY.replaceAll('\n', '\\n') },
    false,
    { AUTH_SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64url') },
  );
  await request('changed-key-access-invalid', '/__auth/current', 401, { cookie: rotated.cookie });
  await request('changed-key-logout-works-without-decrypt', '/api/v1/auth/logout', 200, {
    cookie: rotated.cookie,
    expected: rotated.data.data.authSession.id,
  });
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await h.cleanup();
  await close();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
