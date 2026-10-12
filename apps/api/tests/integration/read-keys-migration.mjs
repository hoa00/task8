import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHarness, api, hash } from '../support/harness.mjs';
import { seedRows, seedSql } from '../../scripts/seed-data.mjs';
import { textKeyVersion } from '../../src/shared/text-key-encoder.ts';
const report = { status: 'RUNNING', commands: [], probes: [] },
  h = await createHarness('read-keys-migration', report);
const oldDirectory = resolve(h.runtime, 'old-migrations');
mkdirSync(oldDirectory);
copyFileSync(
  resolve(api, 'src/db/migrations/0000_freezing_greymalkin.sql'),
  resolve(oldDirectory, '0000_freezing_greymalkin.sql'),
);
const oldConfig = { ...JSON.parse(readFileSync(resolve(api, 'wrangler.jsonc'))) };
oldConfig.d1_databases = oldConfig.d1_databases.map((binding) => ({
  ...binding,
  migrations_dir: oldDirectory,
}));
const oldConfigFile = resolve(h.runtime, 'old.json');
writeFileSync(oldConfigFile, JSON.stringify(oldConfig));
let sequence = 0;
function execute(name, sql) {
  const path = resolve(h.runtime, String(sequence++) + '.sql');
  writeFileSync(path, sql);
  return JSON.parse(
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
      '--file',
      path,
      '--json',
    ]),
  );
}
function migrate(name, config) {
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
    h.persist,
    ...(config ? ['--config', config] : []),
  ]);
}
const tables = [
  'users',
  'workspaces',
  'workspaceMembers',
  'teams',
  'projects',
  'projectMembers',
  'projectMilestones',
  'tasks',
  'subtasks',
  'taskLabels',
  'taskDependencies',
  'comments',
  'commentReactions',
  'files',
  'activity',
  'notifications',
  'calendarEvents',
  'savedViews',
  'memberPreferences',
  'taskFavorites',
  'projectFavorites',
  'memberProjectOrder',
  'commandUndoRecords',
];
const snapshot = (name) =>
  execute(name, tables.map((table) => `SELECT * FROM ${table} ORDER BY rowid;`).join('\n')).map(
    (response, index) => ({
      table: tables[index],
      rows: response.results.map(({ readKeys, ...row }) => {
        void readKeys;
        return row;
      }),
    }),
  );
try {
  migrate('old-ledger', oldConfigFile);
  execute('old-seed', seedSql(seedRows(), 'legacy'));
  const seed = seedRows();
  execute(
    'persisted-mutations',
    `UPDATE tasks SET title='Änne %_ K',descriptionText='persistent mutation',version=version+1,updatedAt=1791799200123 WHERE id='${seed.rows.tasks[0].id}';\nUPDATE users SET name='é é 𐀀',version=version+1 WHERE id='${seed.rows.users[0].id}';\nUPDATE files SET name='Unicode %_ renamed',version=version+1 WHERE id='${seed.rows.files[0].id}';`,
  );
  execute(
    'legacy-wtf8',
    `UPDATE users SET title=CAST(X'EDA080' AS TEXT)||' legacy title' WHERE id='${seed.rows.users[0].id}';`,
  );
  const before = snapshot('before-upgrade');
  h.save('before-upgrade.json', before);
  const oldLedger = execute('ledger-before', 'SELECT id,name FROM d1_migrations ORDER BY id;')[0]
    .results;
  migrate('upgrade');
  assert.deepEqual(
    snapshot('after-upgrade'),
    before,
    'forward ALTER preserves all persisted values',
  );
  report.probes.push({ name: 'upgrade-preserves-all-23-tables', status: 'PASS' });
  const missing = execute(
    'before-backfill',
    "SELECT count(*) missing FROM tasks WHERE json_extract(readKeys,'$.v') IS NULL;",
  )[0].results[0];
  assert(missing.missing > 0);
  h.run('bounded-backfill', ['node', 'scripts/backfill-read-keys.mjs', '--persist-to', h.persist]);
  assert.deepEqual(snapshot('after-backfill'), before, 'backfill changes only derived data');
  const keys = execute(
    'derived-keys',
    `SELECT title,readKeys FROM tasks WHERE id='${seed.rows.tasks[0].id}';`,
  )[0].results[0];
  const encoded = JSON.parse(keys.readKeys);
  assert.equal(encoded.v, textKeyVersion);
  assert.equal(encoded.title.fold, 'änne %_ k');
  assert.equal(encoded.descriptionText.fold, 'persistent mutation');
  h.save('derived-key-proof.json', keys);
  const profileKeys = execute(
    'legacy-text-key-proof',
    `SELECT readKeys FROM users WHERE id='${seed.rows.users[0].id}';`,
  )[0].results[0];
  assert.equal(JSON.parse(profileKeys.readKeys).title.fold, '\ufffd\ufffd\ufffd legacy title');
  const normalizedHash = hash(
    JSON.stringify(
      execute(
        'normalized-snapshot',
        tables.map((table) => `SELECT * FROM ${table} ORDER BY rowid;`).join('\n'),
      ).map((result) => result.results),
    ),
  );
  h.run('backfill-rerun', ['node', 'scripts/backfill-read-keys.mjs', '--persist-to', h.persist]);
  migrate('ledger-rerun');
  const afterHash = hash(
    JSON.stringify(
      execute(
        'normalized-snapshot-rerun',
        tables.map((table) => `SELECT * FROM ${table} ORDER BY rowid;`).join('\n'),
      ).map((result) => result.results),
    ),
  );
  assert.equal(afterHash, normalizedHash);
  const ledger = execute('ledger-after', 'SELECT id,name FROM d1_migrations ORDER BY id;')[0]
    .results;
  assert.deepEqual(ledger.slice(0, oldLedger.length), oldLedger);
  assert.equal(
    ledger.length,
    oldLedger.length +
      readdirSync(resolve(api, 'src/db/migrations')).filter((path) => path.endsWith('.sql'))
        .length -
      1,
  );
  report.probes.push({
    name: 'bounded-backfill-and-rerun-preserve-ledger-and-mutations',
    status: 'PASS',
  });
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
      probes: report.probes,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
