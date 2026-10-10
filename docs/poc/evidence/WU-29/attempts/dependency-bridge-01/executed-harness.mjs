import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';

const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`, parent = '02aa94a965e1cc71a34d209517017b48c1d8cc96';
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique dependency bridge required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const record = file => { const bytes = fs.readFileSync(file); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const run = (id, argv) => { const stdout = fs.openSync(`${output}/${id}.stdout`, 'wx'), stderr = fs.openSync(`${output}/${id}.stderr`, 'wx'), startedAt = new Date().toISOString(), command = `${argv.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ')}\n`; fs.writeFileSync(`${output}/${id}.command.txt`, command, { flag: 'wx' }); const result = spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', stdout, stderr] }); fs.closeSync(stdout); fs.closeSync(stderr); const execution = { argv, command: record(`${output}/${id}.command.txt`), startedAt, finishedAt: new Date().toISOString(), exitStatus: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: record(`${output}/${id}.stdout`), stderr: record(`${output}/${id}.stderr`) }; fs.writeFileSync(`${output}/${id}.execution.json`, `${JSON.stringify(execution, null, 2)}\n`, { flag: 'wx' }); assert.equal(result.status, 0); return execution; };
const ownership = () => ({ immutable: immutableInputs(), assets: { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() } });
const before = ownership(); checkSource();
const head = run('parent-head', ['git', 'rev-parse', 'HEAD']); assert.equal(fs.readFileSync(head.stdout.path, 'utf8').trim(), parent);
const archive = run('parent-code', ['git', 'archive', '--format=tar', parent, 'apps/web/src', 'packages/contracts/src', 'packages/ui/src']);
const tar = fs.readFileSync(archive.stdout.path), baseline = new Map();
for (let offset = 0; offset + 512 <= tar.length;) { const header = tar.subarray(offset, offset + 512); if (header.every(byte => byte === 0)) break; const text = (start, length) => header.subarray(start, start + length).toString().replace(/\0.*$/s, ''), name = [text(345, 155), text(0, 100)].filter(Boolean).join('/'), size = parseInt(text(124, 12).trim() || '0', 8), type = text(156, 1); offset += 512; if (type === '0' || type === '') baseline.set(name, { bytes: size, sha256: sha256(tar.subarray(offset, offset + size)) }); offset += Math.ceil(size / 512) * 512; }
assert.ok(baseline.size > 200);
const current = new Map(), walk = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (entry.isFile()) { const bytes = fs.readFileSync(file); current.set(file, { bytes: bytes.length, sha256: sha256(bytes) }); } else throw Error(`Unexpected production symlink ${file}`); } };
for (const directory of ['apps/web/src', 'packages/contracts/src', 'packages/ui/src']) walk(directory);
const files = [...new Set([...baseline.keys(), ...current.keys()])].sort().map(file => ({ path: file, parent: baseline.get(file) ?? null, current: current.get(file) ?? null, unchanged: JSON.stringify(baseline.get(file)) === JSON.stringify(current.get(file)) }));
const families = [
 ['ui-primitives', ['packages/ui/src/']], ['contracts', ['packages/contracts/src/']], ['tasks-and-fields', ['apps/web/src/features/tasks/']],
 ['task-list', ['apps/web/src/features/task-list/']], ['board', ['apps/web/src/features/task-board/']], ['table', ['apps/web/src/features/task-table/']],
 ['calendar', ['apps/web/src/features/calendar/']], ['timeline', ['apps/web/src/features/timeline/']], ['comments', ['apps/web/src/features/comments/']],
 ['projects', ['apps/web/src/features/projects/']], ['dashboards', ['apps/web/src/features/dashboards/']], ['files', ['apps/web/src/features/files/']],
 ['people', ['apps/web/src/features/people/']], ['teams', ['apps/web/src/features/teams/']], ['settings', ['apps/web/src/features/settings/']],
 ['auth', ['apps/web/src/features/auth/']], ['onboarding', ['apps/web/src/features/onboarding/']], ['search', ['apps/web/src/features/search/']],
 ['inbox', ['apps/web/src/features/inbox/']], ['notifications', ['apps/web/src/features/notifications/']], ['activity', ['apps/web/src/features/activity/']],
 ['archive', ['apps/web/src/features/archive/']], ['dev', ['apps/web/src/features/dev/']], ['shell-and-routes', ['apps/web/src/app/', 'apps/web/src/routes/']],
].map(([id, prefixes]) => { const owned = files.filter(file => prefixes.some(prefix => file.path.startsWith(prefix))); return { id, prefixes, actualFiles: owned.map(file => file.path), unchanged: owned.filter(file => file.unchanged).length, changed: owned.filter(file => !file.unchanged).map(file => file.path), emptyPrefix: owned.length === 0 }; });
const after = ownership(); assert.deepEqual(before, after); checkSource();
const report = { status: 'passed', parent, commands: [head, archive], files, families, ownershipBefore: before, ownershipAfter: after, scope: 'Finite read-only code dependency bridge to the actual pushed WU-28 parent. An unchanged leaf can retain its precisely selected historical visual/behavior evidence when current canonical Shell/page fixtures/fonts and affected owner scenarios are separately verified. This does not relabel any historical failed capture, prove unchanged whole assembled bundles or make every archived viewport current. Changed files require the current affected evidence index.', historicalRootPhysicalCapture: null };
fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); console.log(JSON.stringify({ attempt, files: files.length, unchanged: files.filter(file => file.unchanged).length, changed: files.filter(file => !file.unchanged).length }));
