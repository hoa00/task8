import assert from 'node:assert/strict';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHarness, localFetch, api } from '../support/harness.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
import { textKeyVersion } from '../../src/shared/text-key-encoder.ts';

const report = { status: 'RUNNING', commands: [], probes: [] };
const h = await createHarness('auth-identity', report);
const profile = {
  providerKey: 'ict24h-identity',
  tenant: 'ict24h-rdn-dev',
  subject: randomUUID(),
  email: 'fresh@example.invalid',
  fullname: 'Hòa é é 𐀀',
};
async function request(name, path, status = 200, body) {
  const res = await localFetch(h.baseUrl + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await res.json();
  report.probes.push({ name, status: res.status });
  assert.equal(res.status, status, name);
  return result;
}
async function sql(query, parameters = []) {
  return (await request('sql-' + report.probes.length, '/sql', 200, { sql: query, parameters }))
    .results;
}
function migrate(name, persist = h.persist, config) {
  h.run(name, [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    persist,
    ...(config ? ['--config', config] : []),
  ]);
}
try {
  const old = resolve(h.runtime, 'old-migrations');
  mkdirSync(old);
  for (const name of [
    '0000_freezing_greymalkin.sql',
    '0001_serious_thunderball.sql',
    '0002_melodic_thunderball.sql',
  ])
    copyFileSync(resolve(api, 'src/db/migrations', name), resolve(old, name));
  const config = JSON.parse(readFileSync(resolve(api, 'wrangler.jsonc')));
  config.d1_databases = config.d1_databases.map((row) => ({ ...row, migrations_dir: old }));
  const configFile = resolve(h.runtime, 'old.json');
  writeFileSync(configFile, JSON.stringify(config));
  migrate('old-ledger', h.persist, configFile);
  h.run('seed-old', ['node', 'scripts/seed-local.mjs', '--persist-to', h.persist]);
  const fixture = seedRows();
  const oldTables = Object.keys(fixture.rows);
  const snapshotSql = oldTables.map((table) => `SELECT * FROM ${table} ORDER BY rowid;`).join('\n');
  const snapshot = (name) =>
    JSON.parse(
      h.run(name, [
        'pnpm',
        'exec',
        'wrangler',
        'd1',
        'execute',
        'DB',
        '--local',
        '--persist-to',
        h.persist,
        '--command',
        snapshotSql,
        '--json',
      ]),
    ).map((result) => result.results);
  const beforeUpgrade = snapshot('before-upgrade');
  migrate('upgrade');
  assert.deepEqual(
    snapshot('after-upgrade'),
    beforeUpgrade,
    'forward upgrade preserves every existing fixture row',
  );
  report.probes.push({ name: 'upgrade-preservation', status: 'PASS' });
  migrate('rerun');
  migrate('fresh', resolve(h.runtime, 'fresh-storage'));
  await h.start('mapping', { TEST_MEMBER_ID: fixture.primary.memberId });
  const existing = await sql('SELECT * FROM users ORDER BY id');
  const first = await request('JIT-native-batch', '/identity', 200, profile);
  assert.match(first.data.user.id, /^[0-9a-f-]{14}7/);
  assert.notEqual(first.data.user.id, profile.subject);
  assert.equal(first.statements, 3);
  assert(first.parameters <= 100);
  const repeated = await request('repeat-preserves-profile', '/identity', 200, {
    ...profile,
    fullname: 'Changed central profile',
  });
  assert.deepEqual(repeated.data, first.data);
  const parallelProfile = { ...profile, subject: randomUUID(), email: 'race@example.invalid' };
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      request('concurrent-' + index, '/identity', 200, parallelProfile),
    ),
  );
  for (const result of concurrent) assert.deepEqual(result.data, concurrent[0].data);
  assert.equal(
    (
      await sql('SELECT count(*) count FROM authIdentities WHERE subject=?', [
        parallelProfile.subject,
      ])
    )[0].count,
    1,
  );
  assert.equal(
    (
      await sql('SELECT count(*) count FROM users WHERE emailNormalized=?', [parallelProfile.email])
    )[0].count,
    1,
  );
  const before = await sql('SELECT * FROM users ORDER BY id');
  await request('email-collision', '/identity', 409, {
    ...profile,
    subject: randomUUID(),
    email: existing[0].displayEmail,
  });
  assert.deepEqual(await sql('SELECT * FROM users ORDER BY id'), before);
  const link = {
    providerKey: profile.providerKey,
    tenant: profile.tenant,
    subject: randomUUID(),
    userId: existing[0].id,
  };
  const linked = await request('explicit-link', '/link', 200, link);
  assert.equal(linked.userId, existing[0].id);
  assert.deepEqual(await request('link-idempotent', '/link', 200, link), linked);
  const linkBefore = await sql('SELECT * FROM authIdentities ORDER BY id');
  await request('link-mapped-other-user', '/link', 409, { ...link, userId: existing[1].id });
  await request('link-missing-user', '/link', 409, {
    ...link,
    subject: randomUUID(),
    userId: '01a11abd-aa80-7000-8000-000000000001',
  });
  await request('link-invalid-central-subject', '/link', 400, { ...link, subject: 'bad' });
  assert.deepEqual(await sql('SELECT * FROM authIdentities ORDER BY id'), linkBefore);
  const linkedLogin = await request('linked-login-preserves-existing-user', '/identity', 200, {
    ...profile,
    subject: link.subject,
    email: existing[0].displayEmail,
  });
  assert.equal(linkedLogin.data.user.id, existing[0].id);
  assert.deepEqual(
    await sql('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id', [
      JSON.stringify(existing.map((row) => row.id)),
    ]),
    existing,
  );
  const snap = await sql('SELECT * FROM users ORDER BY id');
  const maps = await sql('SELECT * FROM authIdentities ORDER BY id');
  await sql(
    "CREATE TRIGGER reject_auth_mapping BEFORE INSERT ON authIdentities BEGIN SELECT RAISE(ABORT,'controlled native failure'); END",
  );
  await request('SQL-failure-native-rollback', '/identity', 500, {
    ...profile,
    subject: randomUUID(),
    email: 'rollback@example.invalid',
  });
  assert.deepEqual(await sql('SELECT * FROM users ORDER BY id'), snap);
  assert.deepEqual(await sql('SELECT * FROM authIdentities ORDER BY id'), maps);
  await sql('DROP TRIGGER reject_auth_mapping');
  for (const [name, fullname, expected] of [
    ['boundary240', 'a'.repeat(240), 'a'.repeat(240)],
    ['pair-truncation', 'a'.repeat(239) + '😀tail', 'a'.repeat(239)],
    ['fallback', null, 'boundary-fallback@example.invalid'],
  ]) {
    const email = 'boundary-' + name + '@example.invalid';
    const result = await request(name, '/identity', 200, {
      ...profile,
      subject: randomUUID(),
      email,
      fullname,
      username: null,
    });
    assert.equal(result.data.user.name, expected);
  }
  const count = (await sql('SELECT count(*) count FROM users'))[0].count;
  for (const fullname of ['x\ud800', '\ud800'.repeat(240), 'x'.repeat(239) + '\udc00'])
    await request('lone-surrogate-no-effects', '/identity', 503, {
      ...profile,
      subject: randomUUID(),
      email: 'bad@example.invalid',
      fullname,
    });
  assert.equal((await sql('SELECT count(*) count FROM users'))[0].count, count);
  const [persisted] = await sql('SELECT * FROM users WHERE id=?', [first.data.user.id]);
  const keys = JSON.parse(persisted.readKeys);
  assert.equal(keys.v, textKeyVersion);
  assert(keys.name.locale.length > 0);
  assert.equal(keys.email.fold, profile.email);
  assert.equal(keys.title.fold, '');
  assert.equal(
    (
      await sql('SELECT count(*) count FROM workspaceMembers WHERE userId=?', [first.data.user.id])
    )[0].count,
    0,
  );
  await sql(
    `INSERT INTO workspaceMembers (id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES (?,?,?,'Member','active',?,?,1)`,
    [
      '01a11abd-aa80-7000-8000-000000000099',
      fixture.primary.workspaceId,
      first.data.user.id,
      Date.now(),
      Date.now(),
    ],
  );
  const directory = await request(
    'Unicode-directory-after-controlled-grant',
    '/members/' + fixture.primary.workspaceId,
  );
  assert(
    directory.items.some(
      (member) => member.userId === first.data.user.id && member.name === profile.fullname,
    ),
  );
  await h.stopWorker();
  const operator = JSON.parse(
    h.run('operator-explicit-link', [
      'node',
      '--experimental-transform-types',
      'scripts/link-identity.mjs',
      '--persist-to',
      h.persist,
      '--tenant',
      link.tenant,
      '--subject',
      link.subject,
      '--user-id',
      link.userId,
    ]),
  );
  assert.deepEqual(operator.data, linked);
  report.probes.push({ name: 'operator-local-procedure', status: 'PASS' });
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await h.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
