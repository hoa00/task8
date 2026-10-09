import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'docs/poc/evidence/WU-19', output = `${root}/post-scroll-commands.json`;
if (fs.existsSync(output)) throw Error('Never overwrite actual command evidence');
fs.copyFileSync('tests/visual/notifications/post.mjs', `${root}/post-scroll-executed-harness.mjs`);
const report = { status: 'running', commands: [] };
for (const [id, args] of [
  ['updates-mobile-01', ['tests/visual/notifications/verify.mjs', '--attempt=updates-mobile-01', '--affected-updates-mobile']],
  ['updates-mobile-01-freeze', ['tests/visual/notifications/freeze.mjs', '--attempt=updates-mobile-01']],
  ['tabs-scroll-02', ['tests/visual/notifications/tabs-scroll.mjs', '--attempt=tabs-scroll-02']],
  ['tabs-scroll-02-freeze', ['tests/visual/notifications/freeze.mjs', '--attempt=tabs-scroll-02']],
  ['defaults-01', ['tests/visual/notifications/defaults.mjs', '--attempt=defaults-01']],
  ['defaults-01-freeze', ['tests/visual/notifications/freeze.mjs', '--attempt=defaults-01']],
  ['aggregate-01', ['tests/visual/notifications/aggregate.mjs']],
]) {
  const start = new Date().toISOString(), run = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const log = `${root}/${id}.log`; fs.writeFileSync(log, (run.stdout ?? '') + (run.stderr ?? ''));
  report.commands.push({ id, command: [process.execPath, ...args], start, end: new Date().toISOString(), exitStatus: run.status, signal: run.signal, log });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(`${id}: exit${run.status}`);
  if (run.status !== 0) { if (args.some(arg => arg.startsWith('--attempt='))) { const frozen = spawnSync(process.execPath, ['tests/visual/notifications/freeze.mjs', args.find(arg => arg.startsWith('--attempt='))], { encoding: 'utf8' }); fs.writeFileSync(`${root}/${id}-failed-freeze.log`, (frozen.stdout ?? '') + (frozen.stderr ?? '')); } report.status = 'failed'; fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); process.exit(1); }
}
report.status = 'passed'; fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
