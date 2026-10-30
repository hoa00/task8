import { seedRows, seedSql } from '../../scripts/seed-data.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHarness, localFetch, hash, api } from '../support/harness.mjs';
const report = { status: 'RUNNING', commands: [], probes: [], backups: [] },
  h = await createHarness('oidc-session', report),
  key = randomBytes(32).toString('base64url');
const migrationConfig = resolve(h.runtime, 'current-migrations.json');
const oldMigrations = resolve(h.runtime, 'old-migrations'),
  baseConfig = resolve(h.runtime, 'baseline.json'),
  config = JSON.parse(await readFile(resolve(api, 'wrangler.jsonc'), 'utf8'));
const call = async (method, ...args) => {
  const response = await localFetch(h.baseUrl + '/__private_probe', {
    method: 'POST',
    headers: { 'x-fixture-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  if (!result.ok) throw new Error('MIGRATION_PROBE_FAILURE');
  return result.result;
};
const sql = (query, parameters = []) => call('sql', query, parameters);
async function snapshot() {
  const tables = (
    await sql(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name!='d1_migrations' AND name NOT LIKE 'oidc%' ORDER BY name",
    )
  ).map((row) => row.name);
  const data = {};
  for (const table of tables) {
    assert.match(table, /^[A-Za-z0-9_]+$/u);
    const rows = await sql('SELECT * FROM "' + table + '"');
    data[table] = {
      count: rows.length,
      digest: hash(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort())),
    };
  }
  const schema = await sql(
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('authIdentities','authSessions') ORDER BY type,name",
  );
  const fks = {
    authIdentities: await sql('PRAGMA foreign_key_list(authIdentities)'),
    authSessions: await sql('PRAGMA foreign_key_list(authSessions)'),
  };
  return { data, schemaDigest: hash(JSON.stringify(schema)), fksDigest: hash(JSON.stringify(fks)) };
}
async function start(name) {
  await h.start(name, { AUTH_MODE: 'local', STUDIO_ENV: 'local' }, false, { DRIVER_KEY: key });
}
try {
  const current = structuredClone(config);
  current.main = resolve(api, 'src/index.ts');
  current.d1_databases = current.d1_databases.map((binding) => ({
    ...binding,
    migrations_dir: resolve(api, binding.migrations_dir),
  }));
  await writeFile(migrationConfig, JSON.stringify(current), { mode: 0o600 });
  await mkdir(oldMigrations, { recursive: true, mode: 0o700 });
  for (const name of (await readdir(resolve(api, 'src/db/migrations'))).filter((name) =>
    /^000[0-4]_.*\.sql$/u.test(name),
  ))
    await cp(resolve(api, 'src/db/migrations', name), resolve(oldMigrations, name));
  config.d1_databases = config.d1_databases.map((binding) => ({
    ...binding,
    migrations_dir: oldMigrations,
  }));
  config.main = resolve(api, 'src/index.ts');
  await writeFile(baseConfig, JSON.stringify(config), { mode: 0o600 });
  await mkdir(h.persist, { recursive: true, mode: 0o700 });
  await cp(h.persist, resolve(h.runtime, 'before-schema'), { recursive: true });
  report.backups.push({
    phase: 'before-baseline-schema',
    path: resolve(h.runtime, 'before-schema'),
    empty: true,
  });
  h.run('baseline-migrate', [
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
    baseConfig,
  ]);
  await cp(h.persist, resolve(h.runtime, 'before-fixture-data'), { recursive: true });
  report.backups.push({
    phase: 'before-fixture-data',
    path: resolve(h.runtime, 'before-fixture-data'),
  });
  const seedFile = resolve(h.runtime, 'fixture-seed.sql');
  await writeFile(seedFile, seedSql(seedRows()), { mode: 0o600 });
  h.run('baseline-seed', [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--file',
    seedFile,
    '--persist-to',
    h.persist,
    '--config',
    baseConfig,
  ]);
  await start('baseline');
  const userIds = (await sql('SELECT id FROM users ORDER BY id LIMIT 2')).map((row) => row.id),
    now = Date.now(),
    legacyIdentity = '01a11abd-aa80-7000-8000-000000000091',
    legacySession = '01a11abd-aa80-7000-8000-000000000092';
  await sql(
    'INSERT INTO authIdentities(id,providerKey,tenant,subject,userId,createdAt) VALUES(?,?,?,?,?,?)',
    [
      legacyIdentity,
      'ict24h-identity',
      'legacy-fixture',
      '00000000-0000-4000-8000-000000000001',
      userIds[0],
      now,
    ],
  );
  await sql(
    'INSERT INTO authSessions(id,sidHash,identityId,userId,accessCiphertext,refreshCiphertext,accessExpiresAt,refreshExpiresAt,expiresAt,tokenVersion,authGeneration,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      legacySession,
      'legacy-fixture-digest',
      legacyIdentity,
      userIds[0],
      'fixture-encrypted-access',
      'fixture-encrypted-refresh',
      now + 300000,
      now + 1209600000,
      now + 1209600000,
      1,
      1,
      now,
    ],
  );
  const before = await snapshot();
  report.before = before;
  await h.stopWorker();
  const populated = resolve(h.runtime, 'populated-before-upgrade');
  await cp(h.persist, populated, { recursive: true });
  report.backups.push({ phase: 'populated-before-oidc-upgrade', path: populated });
  h.run('oidc-upgrade', [
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
  h.run('oidc-upgrade-rerun', [
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
  await start('upgraded');
  const after = await snapshot();
  report.after = after;
  assert.deepEqual(after, before);
  assert.deepEqual(
    (
      await sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'oidc%' ORDER BY name",
      )
    ).map((row) => row.name),
    ['oidcAppSessions', 'oidcIdentityLinks', 'oidcLoginTransactions', 'oidcLogoutTransactions'],
  );
  const ledger = await sql('SELECT name FROM d1_migrations ORDER BY id');
  assert.equal(ledger.filter((row) => row.name === '0005_oidc-identity-sessions.sql').length, 1);
  await assert.rejects(
    sql(
      'INSERT INTO authIdentities(id,providerKey,tenant,subject,userId,createdAt) VALUES(?,?,?,?,?,?)',
      ['01a11abd-aa80-7000-8000-000000000093', 'oidc', 'legacy-fixture', 'opaque', userIds[0], now],
    ),
  );
  await assert.rejects(
    sql('UPDATE authSessions SET userId=? WHERE id=?', [userIds[1], legacySession]),
  );
  assert.equal((await sql('PRAGMA foreign_key_check')).length, 0);
  report.probes.push({
    name: 'populated-upgrade-rerun-preserves-data-check-fk-legacy14d',
    status: 'PASS',
    ledgerCount: ledger.length,
    legacyTtlSeconds: 1209600,
    tablesCompared: Object.keys(before.data).length,
  });
  await h.stopWorker();
  await cp(h.persist, resolve(h.runtime, 'upgraded-copy'), { recursive: true });
  // Restore only the stopped, owned rehearsal namespace from its private populated backup.
  await rm(h.persist, { recursive: true });
  await cp(populated, h.persist, { recursive: true });
  await start('restored');
  assert.deepEqual(await snapshot(), before);
  assert.equal((await sql("SELECT name FROM sqlite_master WHERE name LIKE 'oidc%'")).length, 0);
  report.probes.push({ name: 'owned-populated-backup-restore', status: 'PASS' });
  await h.stopWorker();
  h.run('reupgrade-restored-copy', [
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
  await start('reupgraded');
  assert.deepEqual(await snapshot(), before);
  report.probes.push({ name: 'restore-and-reupgrade-keeps-legacy-contract', status: 'PASS' });
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = {
    name: error.name,
    code: error.code ?? null,
    location: error.stack
      ?.split('\n')
      .filter((line) => line.includes('oidc-migration.mjs:'))
      .slice(0, 3),
  };
  process.exitCode = 1;
} finally {
  await h.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      report: h.out + '/report.json',
    }),
  );
}
