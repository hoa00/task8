import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { frontendChecks, selectChecks } from './manifest.mjs';
import { browserResults } from './browser-report.mjs';
import { claimOutput, root } from './output.mjs';

export function parseOptions(args) {
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--checks=')) options.ids = arg.slice(9).split(',');
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg === '--affected') options.affected = true;
    else if (arg === '--skip-tests') options.skipTests = true;
    else if (arg === '--list') options.list = true;
    else throw Error(`Unknown frontend check option: ${arg}`);
  }
  return options;
}
export function testTotals(text) {
  const rows = [...text.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)];
  return rows.length
    ? Object.fromEntries(rows.map(([, key, value]) => [key, Number(value)]))
    : null;
}
async function runChild(check, output, options) {
  const args = typeof check.args === 'function' ? check.args(output) : check.args;
  const log = join(output, `${check.id}.log`);
  const stream = createWriteStream(log, { flags: 'wx' });
  const entry = {
    id: check.id,
    owner: check.owner,
    mode: check.mode,
    command: [check.command, ...args],
    log,
  };
  await new Promise((resolve) => {
    const child = spawn(check.command, args, {
      cwd: options.cwd ?? root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let timedOut = false;
    let forceStop;
    const stop = () => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      forceStop ??= setTimeout(() => {
        try {
          if (process.platform === 'win32') child.kill('SIGKILL');
          else process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }, 2000);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs ?? 600_000);
    const onSignal = () => {
      entry.cancelled = true;
      stop();
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    child.stdout?.pipe(stream, { end: false });
    child.stderr?.pipe(stream, { end: false });
    child.once('error', (error) => {
      entry.error = error.message;
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(forceStop);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      entry.exit = code;
      entry.signal = signal;
      entry.timedOut = timedOut;
      stream.end(resolve);
    });
  });
  const bytes = readFileSync(log);
  entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  entry.totals = testTotals(bytes.toString('utf8'));
  entry.scenarios = [...bytes.toString('utf8').matchAll(/^# Subtest: (.+)$/gm)].map(
    (match) => match[1],
  );
  entry.status =
    entry.exit === 0 && !entry.error && !entry.timedOut && !entry.cancelled ? 'passed' : 'failed';
  if (
    check.test &&
    entry.status === 'passed' &&
    (!entry.totals ||
      entry.totals.tests === 0 ||
      entry.totals.fail > 0 ||
      entry.totals.cancelled > 0)
  ) {
    entry.status = 'failed';
    entry.error = 'Test runner did not report successful nonempty TAP totals';
  }
  if (
    check.test &&
    entry.status === 'passed' &&
    (entry.totals.skipped > 0 || entry.totals.todo > 0)
  )
    entry.status = 'partial';
  if (check.browserReport && entry.status === 'passed') {
    try {
      const browser = browserResults(
        JSON.parse(readFileSync(join(output, check.browserReport), 'utf8')),
      );
      entry.scenarios = browser.scenarios;
      entry.status = browser.status;
    } catch (error) {
      entry.status = 'failed';
      entry.error = String(error.message);
    }
  }
  return entry;
}
export async function runChecks(checks, options = {}) {
  const selected = selectChecks(checks, options);
  if (options.list)
    return selected.map((check) => ({
      id: check.id,
      owner: check.owner,
      mode: check.mode,
      skip: check.skip,
    }));
  const output = claimOutput(options.output, 'frontend', options.cwd ?? root);
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const report = {
    status: 'running',
    startedAt: new Date().toISOString(),
    head: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    dirty: git(['status', '--short']),
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    scope: 'non-API',
    output,
    commands: [],
  };
  const save = () =>
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  let failed = false;
  save();
  for (const check of selected) {
    if (check.skip || failed)
      report.commands.push({
        id: check.id,
        status: 'skipped',
        reason: check.skip ?? 'earlier-failure',
      });
    else {
      const entry = await runChild(check, output, options);
      report.commands.push(entry);
      failed = entry.status === 'failed';
      console.log(`${check.id}: ${entry.status} (exit ${entry.exit})`);
    }
    save();
  }
  const omitted = report.commands.some(
    (entry) =>
      entry.status === 'skipped' && !checks.find((check) => check.id === entry.id)?.optional,
  );
  report.status = failed
    ? 'failed'
    : omitted || report.commands.some((entry) => entry.status === 'partial')
      ? 'partial'
      : 'passed';
  report.finishedAt = new Date().toISOString();
  save();
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseOptions(process.argv.slice(2));
  const result = await runChecks(frontendChecks(), options);
  console.log(JSON.stringify(result));
  if (result.status === 'failed') process.exitCode = 1;
}
