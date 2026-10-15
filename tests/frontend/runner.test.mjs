import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { frontendChecks, selectChecks } from './manifest.mjs';
import { claimOutput } from './output.mjs';
import { discoverTests } from './discover.mjs';
import { runChecks, testTotals, parseOptions } from './check.mjs';
import { semanticSyntax } from './format.mjs';

for (const affected of [false, true])
  for (const skipTests of [false, true])
    test(`selection affected=${affected} skipTests=${skipTests} retains build and reports tests`, () => {
      const checks = selectChecks(frontendChecks(), { affected, skipTests });
      for (const id of ['lint', 'build', 'http-build', 'http-bundle'])
        assert.equal(checks.find((check) => check.id === id).skip, null);
      assert.equal(!!checks.find((check) => check.id === 'web-tests').skip, affected || skipTests);
      assert.equal(checks.find((check) => check.id === 'reference').skip, 'not-selected');
    });

test('selection rejects unknown/duplicate IDs and unsupported flags', () => {
  assert.throws(() => selectChecks(frontendChecks(), { ids: ['oops'] }), /Unknown/);
  assert.throws(() => selectChecks(frontendChecks(), { ids: ['build', 'build'] }), /Duplicate/);
  assert.throws(() => parseOptions(['--from=lint']), /Unknown/);
});

test('output is exclusive and cannot write historical evidence or escape via symlink', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'frontend-output-'));
  const other = mkdtempSync(join(tmpdir(), 'frontend-other-'));
  try {
    const output = claimOutput('test-results/new-run', 'test', workspace);
    assert.throws(() => claimOutput('test-results/new-run', 'test', workspace), /EEXIST/);
    assert.throws(
      () => claimOutput('docs/poc/evidence/WU-06', 'test', workspace),
      /inside test-results/,
    );
    symlinkSync(other, join(workspace, 'test-results/link'));
    assert.throws(() => claimOutput('test-results/link/run', 'test', workspace), /escapes/);
    assert.equal(output, join(workspace, 'test-results/new-run'));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('web discovery includes newly added feature and consumer tests', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'frontend-discover-'));
  try {
    mkdirSync(join(workspace, 'src/features/example'), { recursive: true });
    mkdirSync(join(workspace, 'tests/data'), { recursive: true });
    writeFileSync(join(workspace, 'src/features/example/new.test.ts'), '');
    writeFileSync(join(workspace, 'tests/data/consumer.test.ts'), '');
    assert.deepEqual(discoverTests(workspace, ['src', 'tests']), [
      'src/features/example/new.test.ts',
      'tests/data/consumer.test.ts',
    ]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('runner records actual counts and propagates child failure/spawn error/timeout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'frontend-run-'));
  const command = (id, code) => ({
    id,
    command: process.execPath,
    args: ['-e', code],
    owner: 'fixture',
    mode: 'unit',
  });
  try {
    const passed = await runChecks(
      [
        {
          ...command('unit', "console.log('# tests 3\\n# pass 3\\n# fail 0\\n# skipped 0')"),
          test: true,
        },
      ],
      { cwd: workspace },
    );
    assert.equal(passed.status, 'passed');
    assert.equal(passed.commands[0].totals.tests, 3);
    const failed = await runChecks(
      [command('failure', 'process.exit(7)'), command('later', 'process.exit(0)')],
      { cwd: workspace },
    );
    assert.equal(failed.status, 'failed');
    assert.equal(failed.commands[0].exit, 7);
    assert.equal(failed.commands[1].reason, 'earlier-failure');
    assert.equal(JSON.parse(readFileSync(join(failed.output, 'report.json'))).status, 'failed');
    const missing = await runChecks(
      [{ ...command('missing', ''), command: 'nonexistent-frontend-check-command' }],
      { cwd: workspace },
    );
    assert.equal(missing.status, 'failed');
    assert.match(missing.commands[0].error, /ENOENT/);
    const timeout = await runChecks([command('timeout', 'setInterval(()=>{},1000)')], {
      cwd: workspace,
      timeoutMs: 100,
    });
    assert.equal(timeout.status, 'failed');
    assert.equal(timeout.commands[0].timedOut, true);
    const silent = await runChecks([{ ...command('empty', ''), test: true }], { cwd: workspace });
    assert.equal(silent.status, 'failed');
    const skipped = await runChecks(
      [
        {
          ...command('skipped', "console.log('# tests 3\\n# pass 2\\n# fail 0\\n# skipped 1')"),
          test: true,
        },
      ],
      { cwd: workspace },
    );
    assert.equal(skipped.status, 'partial');
    const partial = await runChecks([command('first', ''), command('second', '')], {
      cwd: workspace,
      ids: ['first'],
    });
    assert.equal(partial.status, 'partial');
    assert.equal(partial.commands[1].reason, 'not-selected');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('TAP totals come from runner output and formatting comparison detects behavior changes', () => {
  assert.deepEqual(testTotals('# tests 21\n# pass 20\n# fail 1\n'), {
    tests: 21,
    pass: 20,
    fail: 1,
  });
  assert.equal(testTotals('some text 19 tests'), null);
  assert.deepEqual(
    semanticSyntax('a.ts', "const f = (x: number) => 'yes';"),
    semanticSyntax('a.ts', 'const f=(x:number)=>"yes";'),
  );
  assert.notDeepEqual(semanticSyntax('a.ts', 'const f=1'), semanticSyntax('a.ts', 'const f=2'));
});

test('formatter accepts associative short-circuit regrouping but preserves order, mixed precedence and arithmetic', () => {
  for (const operator of ['||', '&&', '??'])
    assert.deepEqual(
      semanticSyntax('a.ts', `const result = a() ${operator} (b() ${operator} c());`),
      semanticSyntax('a.ts', `const result = (a() ${operator} b()) ${operator} c();`),
    );
  assert.notDeepEqual(
    semanticSyntax('a.ts', 'const result = a() || b();'),
    semanticSyntax('a.ts', 'const result = b() || a();'),
  );
  assert.notDeepEqual(
    semanticSyntax('a.ts', 'const result = a ?? (b || c);'),
    semanticSyntax('a.ts', 'const result = (a ?? b) || c;'),
  );
  assert.notDeepEqual(
    semanticSyntax('a.ts', 'const result = a + (b + c);'),
    semanticSyntax('a.ts', 'const result = (a + b) + c;'),
  );
});

test('runner aggregates actual browser scenarios and fails missing/incomplete child reports', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'browser-run-report-'));
  const check = (body) => ({
    id: 'browser',
    owner: 'fixture',
    mode: 'browser',
    browserReport: 'browser.json',
    command: process.execPath,
    args: (output) => [
      '-e',
      'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
      join(output, 'browser.json'),
      JSON.stringify(body),
    ],
  });
  try {
    const passed = await runChecks(
      [check({ status: 'passed', probes: [{ id: 'actual-case', pass: true }] })],
      { cwd: workspace },
    );
    assert.deepEqual(passed.commands[0].scenarios, [{ id: 'actual-case', status: 'passed' }]);
    const partial = await runChecks(
      [
        check({
          status: 'partial',
          probes: [{ id: 'unselected', status: 'skipped', reason: 'selection' }],
        }),
      ],
      { cwd: workspace },
    );
    assert.equal(partial.status, 'partial');
    const failed = await runChecks(
      [check({ status: 'passed', probes: [{ id: 'actual-failure', pass: false }] })],
      { cwd: workspace },
    );
    assert.equal(failed.status, 'failed');
    const incomplete = await runChecks([check({ status: 'running', probes: [] })], {
      cwd: workspace,
    });
    assert.equal(incomplete.status, 'failed');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
