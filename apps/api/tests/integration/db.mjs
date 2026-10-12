import assert from 'node:assert/strict';
import { createHarness } from '../support/harness.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
const report = { status: 'RUNNING', commands: [], probes: [] },
  h = await createHarness('db', report),
  seed = seedRows();
async function get(name, path) {
  const response = await fetch(h.baseUrl + path);
  assert.equal(response.status, 200, name);
  const value = await response.json();
  h.save(name + '.json', value);
  report.probes.push({ name, path, status: response.status });
  return value;
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
  h.run('seed', ['node', 'scripts/seed-local.mjs', '--persist-to', h.persist]);
  await h.start('owner', {
    LOCAL_USER_ID: seed.primary.userId,
    LOCAL_WORKSPACE_ID: seed.primary.workspaceId,
  });
  const accounting = await get('accounting', '/__db/accounting');
  assert.equal(accounting.statements, 9);
  assert.equal(
    accounting.trace.reduce((sum, row) => sum + row.statements, 0),
    9,
  );
  assert.equal(accounting.trace.at(-1).status, 'failure');
  const before = await get('before-budget', '/__db/version');
  await get('budget', '/__db/budget');
  assert.deepEqual(await get('after-budget', '/__db/version'), before);
  await get('seed-policy', '/__db/seed-policy');
  assert.equal((await get('actor-policy', '/__db/actor-policy')).cases, 48);
  assert.equal((await get('project-policy', '/__db/project-policy')).cases, 3);
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
