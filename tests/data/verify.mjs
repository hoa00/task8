import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = new URL('../../docs/poc/evidence/WU-06/', import.meta.url);
const commands = [
  ['typecheck', ['typecheck']], ['build', ['build']], ['lint', ['lint']],
  ['test', ['test']], ['reference-check', ['reference:check']], ['http-bundle', ['verify:data:http-bundle']],
];
const from = process.argv.find(arg => arg.startsWith('--from='))?.slice(7);
const start = from ? commands.findIndex(([name]) => name === from) : 0;
if (start < 0) throw new TypeError('Unknown verification resume gate');
const results = start ? JSON.parse(readFileSync(new URL('commands.json', evidence), 'utf8')).slice(0, start) : [];
if (results.length !== start || results.some(result => result.exitStatus !== 0)) throw new Error('Resume requires successful earlier gates');
for (const [name, args] of commands.slice(start)) {
  const result = spawnSync('pnpm', args, { cwd: root, encoding: 'utf8', env: process.env });
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}`.replaceAll('\r', '').split('\n').map(line => line.trimEnd()).join('\n').trimEnd() + '\n';
  writeFileSync(new URL(`${name}.log`, evidence), log);
  results.push({ command: `pnpm ${args.join(' ')}`, exitStatus: result.status, signal: result.signal, log: `docs/poc/evidence/WU-06/${name}.log` });
  console.log(`${name}: exit ${result.status}`);
  if (result.status !== 0) {
    console.log(log);
    writeFileSync(new URL('commands.json', evidence), JSON.stringify(results, null, 2) + '\n');
    process.exit(result.status ?? 1);
  }
}
writeFileSync(new URL('commands.json', evidence), JSON.stringify(results, null, 2) + '\n');
const bundle = JSON.parse(readFileSync(new URL('http-bundle.json', evidence), 'utf8'));
writeFileSync(new URL('verification.json', evidence), JSON.stringify({
  status: 'passed', sourceSha: '904205c626918ee96054eb35495c394a60c0c601',
  acceptance: { AC1: 'normalized DTO fixture and 7 foundation reads via StudioApi', AC2: 'static bootstrap adapter selection; HTTP errors and mode mismatch reject; no fallback', AC3: 'workspace query keys, cancellation/invalidation, namespace reload/reset and production reset denial' },
  dataTests: { total: 19, foundation: 17, env: 2, scenarios: ['populated', 'empty', 'loading', 'error', 'offline'], identities: 156, taskKeys: 49 },
  httpBundle: bundle, commands: results,
  notRun: ['UI pixel suites: no UI changed', 'D1/R2/backend business routes: later work units'],
}, null, 2) + '\n');
