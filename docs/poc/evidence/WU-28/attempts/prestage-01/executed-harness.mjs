import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv[2], root = `docs/poc/evidence/WU-28/attempts/${attempt}`;
assert.ok(attempt && !fs.existsSync(root)); fs.mkdirSync(root, { recursive: true }); fs.copyFileSync(import.meta.filename, `${root}/executed-harness.mjs`);
const record = (file, bytes) => { fs.writeFileSync(file, bytes, { flag: 'wx' }); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const commands = [
  ['HEAD', ['git', 'rev-parse', 'HEAD']], ['tree', ['git', 'rev-parse', 'HEAD^{tree}']], ['parent', ['git', 'rev-parse', 'HEAD^']], ['branch', ['git', 'branch', '--show-current']], ['origin', ['git', 'remote', 'get-url', 'origin']],
  ['freshMain', ['git', 'ls-remote', 'origin', 'refs/heads/main']], ['trackingMain', ['git', 'rev-parse', 'origin/main']], ['divergence', ['git', 'rev-list', '--left-right', '--count', 'HEAD...origin/main']], ['index', ['git', 'diff', '--cached', '--name-only', '-z']], ['status', ['git', 'status', '--porcelain=v1', '-uall']],
  ['SourceHEAD', ['git', '-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD']], ['SourceTree', ['git', '-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD^{tree}']], ['SourceStatus', ['git', '-C', '.reference/gr8r-studio', 'status', '--porcelain=v1']], ['SourceTracked', ['git', '-C', '.reference/gr8r-studio', 'ls-files', '-z']], ['ports', ['ss', '-ltn']],
  ['activeWhitespace', ['git', 'diff', '--check', '--', 'apps', 'packages', 'tests', 'docs/poc/PROGRESS.md', 'docs/poc/COMMAND_INTEGRATIONS.md', 'docs/poc/DECISIONS.md', 'docs/poc/VISUAL_PARITY.md', 'package.json', 'eslint.config.mjs']],
];
const report = { status: 'running', commands: [], base: 'f2daa4e27916949efc167c8dce09846b9610304c', scope: 'Finite read-only Git/Source/ports/active-whitespace packet before root pre-stage. No staging, DONE, commit or push. Actual fresh remote-main must equal prerequisite.' };
try {
  const outputs = {};
  for (const [id, argv] of commands) { const run = spawnSync(argv[0], argv.slice(1)); assert.equal(run.status, 0, id); outputs[id] = run.stdout.toString(); report.commands.push({ id, argv, command: record(`${root}/${id}.command`, Buffer.from(argv.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ') + '\n')), exitStatus: run.status, stdout: record(`${root}/${id}.stdout`, run.stdout), stderr: record(`${root}/${id}.stderr`, run.stderr) }); }
  for (const id of ['HEAD', 'trackingMain']) assert.equal(outputs[id].trim(), report.base); assert.equal(outputs.freshMain.trim().split(/\s/)[0], report.base); assert.equal(outputs.branch.trim(), 'work'); assert.equal(outputs.origin.trim(), 'https://github.com/hoa00/task8.git'); assert.equal(outputs.divergence.trim().replaceAll(/\s+/g, '/'), '0/0'); assert.equal(outputs.index, '');
  assert.equal(outputs.SourceHEAD.trim(), '904205c626918ee96054eb35495c394a60c0c601'); assert.equal(outputs.SourceTree.trim(), '5db5f992886b2345881946cf85fac098307953a5'); assert.equal(outputs.SourceStatus, ''); assert.equal(outputs.SourceTracked.split('\0').filter(Boolean).length, 86); assert.ok(!/:(4173|5173|5174|8787)\s/.test(outputs.ports)); assert.equal(outputs.activeWhitespace, ''); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error.stack); throw error; } finally { fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
console.log(JSON.stringify({ status: report.status, commands: report.commands.length }));
