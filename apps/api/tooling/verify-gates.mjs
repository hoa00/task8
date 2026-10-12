import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const outRoot = resolve(process.env.API_TEST_OUTPUT_DIR ?? resolve(root, 'test-results/api'));
mkdirSync(outRoot, { recursive: true });
const out = mkdtempSync(resolve(outRoot, 'gates-'));
const results = [];
function run(name, argv) {
  const startedAt = new Date().toISOString();
  const value = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const field of ['stdout', 'stderr'])
    writeFileSync(resolve(out, name + '.' + field + '.log'), value[field] ?? '');
  results.push({
    name,
    argv,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: value.status,
    signal: value.signal,
    error: value.error?.message ?? null,
  });
  writeFileSync(resolve(out, 'commands.json'), JSON.stringify(results, null, 2) + '\n');
  assert.equal(value.error, undefined);
  return value;
}
const worker = resolve(root, 'apps/api/tests/integration/gate-probe.worker.ts');
const unit = resolve(root, 'apps/api/tests/unit/gate-probe.test.mjs');
assert(!existsSync(worker) && !existsSync(unit), 'Refuse to overwrite existing files');
try {
  writeFileSync(
    worker,
    "const invalid: number = 'active-worker-type-gate'; export default invalid;\n",
  );
  const typecheck = run('active-worker-rejected', ['pnpm', '--filter', '@studio/api', 'typecheck']);
  assert.notEqual(typecheck.status, 0);
  assert.match(typecheck.stdout + typecheck.stderr, /gate-probe\.worker\.ts.*TS2322/);
} finally {
  if (existsSync(worker)) unlinkSync(worker);
}
try {
  writeFileSync(
    unit,
    "import { test } from 'node:test'; test('BR01_API_FAILURE_SENTINEL', () => { throw Error('BR01_API_FAILURE_SENTINEL'); });\n",
  );
  const failed = run('root-api-failure-propagation', ['pnpm', 'test']);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /BR01_API_FAILURE_SENTINEL/);
  assert.match(failed.stdout + failed.stderr, /@studio\/api.*test/);
} finally {
  if (existsSync(unit)) unlinkSync(unit);
}
console.log(JSON.stringify({ status: 'PASS', out, checks: results.length }));
