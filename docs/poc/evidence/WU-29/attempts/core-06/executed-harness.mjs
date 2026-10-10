import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(`docs/poc/evidence/WU-29/${attempt}-http-bundle`, { recursive: true });
fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
fs.copyFileSync('tests/data/http-bundle.mjs', `${output}/executed-http-bundle.mjs`);
const report = { status: 'running', commands: [], runtime: { node: process.version } };
const commands = [['syntax', ['node', '--check', 'tests/visual/m2/visual.mjs']], ['typecheck', ['pnpm', 'typecheck']], ['test', ['pnpm', 'test']], ['lint', ['pnpm', 'lint']], ['build', ['pnpm', 'build']], ['HTTPbuild', ['pnpm', '--filter', '@studio/web', 'build:http']], ['HTTPbundle', ['node', 'tests/data/http-bundle.mjs', 'WU-29', `--evidence-suffix=${attempt}-http-bundle`]], ['reference', ['pnpm', 'reference:check']]];
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
for (const [id, argv] of commands) {
  const out = fs.openSync(`${output}/${id}.stdout`, 'wx'), err = fs.openSync(`${output}/${id}.stderr`, 'wx');
  const result = spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', out, err] });
  fs.closeSync(out); fs.closeSync(err);
  const record = path => { const bytes = fs.readFileSync(path); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
  report.commands.push({ id, argv, exitStatus: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: record(`${output}/${id}.stdout`), stderr: record(`${output}/${id}.stderr`) }); save();
  console.log(`${id}: ${result.status}`);
  if (result.status !== 0) { report.status = 'failed'; break; }
}
if (report.status !== 'failed') report.status = 'passed';
save();
if (report.status !== 'passed') process.exitCode = 1;
