import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHarness } from '../support/harness.mjs';
import { selectFeatures, features } from '../run.mjs';

test('feature runner selects known suites and rejects typos', () => {
  assert.deepEqual(selectFeatures([]), features);
  assert.deepEqual(selectFeatures(['--feature', 'tasks']), ['tasks']);
  assert.throws(() => selectFeatures(['--feature', 'task']));
});
test('isolated run IDs, storage and ephemeral ports', async () => {
  const first = await createHarness('harness', { commands: [] });
  const second = await createHarness('harness', { commands: [] });
  try {
    assert.notEqual(first.out, second.out);
    assert.notEqual(first.persist, second.persist);
    assert.notEqual(first.port, second.port);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
test('startup timeout terminates owned process even before launch returns', async () => {
  const report = { commands: [] },
    harness = await createHarness('timeout', report);
  try {
    await assert.rejects(
      harness.launch(
        'not-ready',
        [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
        undefined,
        { timeoutMs: 100 },
      ),
      /Startup timeout/,
    );
    assert.equal(report.commands.length, 1);
    assert.equal(report.commands[0].exitCode, null);
    assert.equal(report.commands[0].signal, 'SIGTERM');
    assert.equal(report.commands[0].shutdown, 'Owned process group SIGTERM');
  } finally {
    await harness.cleanup();
  }
  assert.equal(JSON.parse(readFileSync(harness.out + '/report.json')).commands.length, 1);
});
test('early exit records real code and command failure cannot pass', async () => {
  const report = { commands: [] },
    harness = await createHarness('exit', report);
  try {
    await assert.rejects(
      harness.launch('early-exit', [process.execPath, '-e', 'process.exit(7)']),
      /before readiness/,
    );
    assert.equal(report.commands[0].exitCode, 7);
    assert.throws(() =>
      harness.run('command-failure', [process.execPath, '-e', 'process.exit(9)']),
    );
    assert.equal(report.commands[1].exitCode, 9);
  } finally {
    await harness.cleanup();
  }
});

test('spawn failure preserves ENOENT without trying to kill an unowned PID', async () => {
  const report = { commands: [] },
    harness = await createHarness('spawn', report);
  try {
    await assert.rejects(
      harness.launch('missing-command', ['/tmp/task8-api-missing-executable']),
      (error) => error.code === 'ENOENT',
    );
    assert.match(report.commands[0].error, /ENOENT/);
    assert.equal(report.commands[0].signal, null);
  } finally {
    await harness.cleanup();
  }
});
