import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('Unique attempt required');
const output = `docs/poc/evidence/WU-21/attempts/${attempt}`;
if (fs.existsSync(output)) throw Error('Never overwrite actual executed evidence');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync('tests/visual/teams/gates.mjs', `${output}/executed-harness.mjs`);
const commands = [ ['typecheck', 'pnpm', ['typecheck']], ['test', 'pnpm', ['test']], ['lint', 'pnpm', ['lint']], ['build', 'pnpm', ['build']], ['http-build', 'pnpm', ['--filter', '@studio/web', 'build:http']], ['http-bundle', 'node', ['tests/data/http-bundle.mjs', 'WU-21', `--evidence-suffix=attempts/${attempt}`]], ['reference', 'pnpm', ['reference:check']] ];
// HTTP bundle's explicit suffix accepts a simple owned destination. The report
// is generated inside WU21 and copied into this immutable executed attempt.
commands[5][2][2] = `--evidence-suffix=${attempt}`;
fs.mkdirSync(`docs/poc/evidence/WU-21/${attempt}`, { recursive: true });
const report = { status: 'running', commands: [] };
if(process.argv.includes('--affected'))commands.splice(0,2);
if(process.argv.includes('--skip-tests'))commands.splice(1,1);
for (const [id, command, args] of commands) { const result = spawnSync(command, args, { env: process.env, encoding: 'buffer', maxBuffer: 40 * 1024 * 1024 }); const log = `${output}/${id}.log`; fs.writeFileSync(log, Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)])); report.commands.push({ id, command: [command, ...args], exitStatus: result.status, signal: result.signal, log, sha256: sha256(fs.readFileSync(log)) }); fs.writeFileSync(`${output}/commands.json`, JSON.stringify(report, null, 2) + '\n'); console.log(`${id}: actualexit${result.status}`); if (result.status !== 0) { report.status = 'failed'; fs.writeFileSync(`${output}/commands.json`, JSON.stringify(report, null, 2) + '\n'); process.exit(result.status ?? 1); } }
report.status = 'passed'; fs.writeFileSync(`${output}/commands.json`, JSON.stringify(report, null, 2) + '\n');
