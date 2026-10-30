import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { seedRows, seedSql } from '../../scripts/seed-data.mjs';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHarness, localFetch, api } from '../support/harness.mjs';
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
  const migrationConfig = resolve(h.runtime, 'migrations.json'),
    config = JSON.parse(await readFile(resolve(api, 'wrangler.jsonc'), 'utf8'));
  config.main = resolve(api, 'src/index.ts');
  config.d1_databases = config.d1_databases.map((binding) => ({
    ...binding,
    migrations_dir: resolve(api, binding.migrations_dir),
  }));
  await writeFile(migrationConfig, JSON.stringify(config), { mode: 0o600 });
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
    '--config',
    migrationConfig,
  ]);
  const fixture = seedRows();
  const seedPath = resolve(h.runtime, 'populated-fixture.sql');
  await writeFile(seedPath, seedSql(fixture), { mode: 0o600 });
  h.run('seed-isolated-populated-fixture', [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--persist-to',
    h.persist,
    '--config',
    migrationConfig,
    '--file',
    seedPath,
  ]);
  await cp(h.persist, resolve(h.runtime, 'populated-before-explicit-link'), { recursive: true });
  report.populatedBeforeLinkBackup = { path: resolve(h.runtime, 'populated-before-explicit-link') };
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
  const sql = async (query, parameters = []) => {
    const response = await localFetch(h.baseUrl + '/__auth/sql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql: query, parameters }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).results;
  };
  const tables = (
    await sql(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'oidc%' AND name NOT IN ('d1_migrations','authSessions','authIdentities') ORDER BY name",
    )
  ).map((row) => row.name);
  const businessSnapshot = async () => {
    const result = {};
    for (const table of tables) {
      assert.match(table, /^[A-Za-z0-9_]+$/u);
      const rows = await sql('SELECT * FROM ' + table);
      result[table] = {
        count: rows.length,
        sha256: createHash('sha256')
          .update(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()))
          .digest('hex'),
      };
    }
    return result;
  };
  const beforeLink = await businessSnapshot();
  const preexistingUsers = await sql('SELECT * FROM users ORDER BY id');
  await sql(
    'INSERT INTO authIdentities(id,providerKey,tenant,subject,userId,createdAt) VALUES(?,?,?,?,?,?)',
    [
      fixture.primary.userId,
      'ict24h-identity',
      provider.tenant,
      provider.accounts[0].id,
      fixture.primary.userId,
      Date.now(),
    ],
  );
  assert.deepEqual(await businessSnapshot(), beforeLink);
  report.populatedBeforeLink = beforeLink;
  report.explicitLegacyLink = {
    existingUserId: fixture.primary.userId,
    noMembershipCreation: true,
    businessUnchanged: true,
  };
  const context = await localFetch(h.baseUrl + '/auth/context');
  assert.equal(context.status, 200);
  const preauthCookie = context.headers.get('set-cookie').split(';')[0],
    csrf = (await context.json()).csrf;
  const signed = await localFetch(h.baseUrl + '/api/v1/auth/login', {
    method: 'POST',
    headers: {
      origin: h.baseUrl,
      'content-type': 'application/json',
      cookie: preauthCookie,
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({
      email: provider.accounts[0].email,
      password: 'correct-password',
      remember: true,
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
  assert.match(signed.headers.get('set-cookie'), /Max-Age=1209[0-9]{3}/u);
  const currentId = data.data.authSession.id,
    proof = (
      await (
        await localFetch(h.baseUrl + '/auth/context', { headers: { cookie: legacyCookie } })
      ).json()
    ).csrf;
  const legacyVars = {
    AUTH_MODE: 'ict24h',
    AUTH_PROVIDER_KEY: 'ict24h-identity',
    AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
    AUTH_TENANT_ID: provider.tenant,
    AUTH_APP_ORIGIN: h.baseUrl,
    AUTH_PUBLIC_KEY: provider.publicKey,
    TEST_PROVIDER_URL: provider.providerUrl,
  };
  const snapshot = async () => {
    const response = await localFetch(h.baseUrl + '/__auth/sql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT id,name,displayEmail FROM users ORDER BY id' }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).results;
  };
  const before = await snapshot();
  const beforeModeSwitch = await businessSnapshot();
  for (const table of tables.filter((table) => table !== 'users'))
    assert.deepEqual(beforeModeSwitch[table], beforeLink[table]);
  assert.equal(data.data.user.id, fixture.primary.userId);
  assert.equal(beforeModeSwitch.users.count, beforeLink.users.count);
  assert.deepEqual(
    (await sql('SELECT * FROM users ORDER BY id')).filter(
      (row) => row.id !== fixture.primary.userId,
    ),
    preexistingUsers.filter((row) => row.id !== fixture.primary.userId),
  );
  report.populatedBeforeModeSwitch = beforeModeSwitch;
  report.legacyProfileSync = {
    onlyExistingLinkedUserProfileMayChange: true,
    domainTablesUnchanged: true,
  };
  await h.stopWorker();
  await cp(h.persist, resolve(h.runtime, 'populated-before-mode-switch'), { recursive: true });
  report.modeSwitchBackup = { path: resolve(h.runtime, 'populated-before-mode-switch') };
  await h.start(
    'explicit-oidc',
    {
      AUTH_MODE: 'oidc',
      STUDIO_ENV: 'local',
      AUTH_APP_ORIGIN: 'https://datamaker-task.demo',
      OIDC_ISSUER: 'https://identity-service.demo/api/auth',
      OIDC_CLIENT_ID: 'isolated-mode-negative',
      RP_ENVIRONMENT: 'legacy-rollback',
    },
    false,
    {
      OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'),
      RP_TOKEN_ENCRYPTION_KEYSET: JSON.stringify({
        active: 'fixture',
        keys: { fixture: randomBytes(32).toString('base64url') },
      }),
    },
  );
  assert.equal(
    (await localFetch(h.baseUrl + '/api/v1/session', { headers: { cookie: legacyCookie } })).status,
    401,
  );
  report.probes.push({ name: 'legacy-cookie-denied-in-explicit-oidc-mode', status: 401 });
  assert.equal(
    (
      await localFetch(h.baseUrl + '/api/v1/auth/login', {
        method: 'POST',
        headers: { origin: h.baseUrl, 'content-type': 'application/json' },
        body: JSON.stringify({
          email: provider.accounts[0].email,
          password: 'correct-password',
          remember: true,
        }),
      })
    ).status,
    501,
  );
  assert.deepEqual(await businessSnapshot(), beforeModeSwitch);
  report.populatedInOidcMode = await businessSnapshot();
  await h.stopWorker();
  await h.start('rollback-explicit-legacy', legacyVars, false, {
    AUTH_SESSION_ENCRYPTION_KEY: provider.secret,
  });
  await request('legacy-cookie-valid-after-explicit-mode-rollback', { cookie: legacyCookie }, 200);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await businessSnapshot(), beforeModeSwitch);
  report.populatedAfterRollback = await businessSnapshot();
  const refreshed = await localFetch(h.baseUrl + '/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      origin: h.baseUrl,
      cookie: legacyCookie,
      'x-csrf-token': proof,
      'x-task8-session-id': currentId,
    },
  });
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).data.user.id, data.data.user.id);
  const logout = await localFetch(h.baseUrl + '/api/v1/auth/logout', {
    method: 'POST',
    headers: {
      origin: h.baseUrl,
      cookie: legacyCookie,
      'x-csrf-token': proof,
      'x-task8-session-id': currentId,
    },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/u);
  await request('legacy-local-logout-remains-revoked', { cookie: legacyCookie }, 401);
  report.probes.push({
    name: 'explicit-mode-rollback-refresh-logout-preserves-local-user-ids',
    status: 'PASS',
    rememberSeconds: 1209600,
    refresh: 200,
    logout: 200,
    localUsersUnchanged: true,
  });

  assert.deepEqual(await businessSnapshot(), beforeModeSwitch);
  report.populatedAfterRefreshLogout = await businessSnapshot();
  report.probes.push({
    name: 'populated-mode-switch-rollback-preserves-tasks-projects-versions-assignees-members-history',
    status: 'PASS',
    tables: tables.length,
    tasks: beforeModeSwitch.tasks.count,
    projects: beforeModeSwitch.projects.count,
    members: beforeModeSwitch.workspaceMembers.count,
    activity: beforeModeSwitch.activity.count,
  });
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
