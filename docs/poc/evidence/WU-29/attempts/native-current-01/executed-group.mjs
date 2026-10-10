import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';

const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique native group required');
const owners = [
 ['fields', 'tasks/interactions'], ['list', 'task-list/interactions'], ['detail', 'task-detail/interactions'], ['comments', 'task-collaboration/interactions'],
 ['board', 'task-board/interactions'], ['journey', 'task-board/journey'], ['table', 'task-table/interactions'], ['calendar', 'calendar/interactions'], ['timeline', 'timeline/interactions'],
 ['projects', 'projects/interactions'], ['dashboards', 'dashboards/interactions'], ['search', 'search/interactions'], ['notifications', 'notifications/interactions'],
 ['people', 'people/interactions'], ['teams', 'teams/interactions'], ['files', 'files/interactions'], ['settings', 'settings/interactions'],
 ['workspace', 'settings/workspace-interactions'], ['security', 'settings/security-interactions'], ['auth', 'auth/interactions'], ['onboarding', 'onboarding/interactions'],
 ['archive', 'archive/native'], ['shell', 'shell/routes'],
];
const selected = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
if (selected && selected.some(id => !owners.some(row => row[0] === id))) throw Error('Unknown native owner');
const matrix = owners.filter(row => !selected || selected.includes(row[0])); assert.ok(matrix.length);
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-group.mjs`);
const report = { status: 'running', scope: 'Selected actual current native assertions with unchanged original owner entry routes and limitations. Feature QA entries and whole canonical AppShell probes are explicitly distinguished in the M2 index; no inventory-wide action PASS inferred from this group.', matrix, commands: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const record = file => { const bytes = fs.readFileSync(file); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
for (const [id, owner] of matrix) {
 const child = `${attempt}-${id}`, argv = [process.execPath, 'tests/visual/m2/replay-native.mjs', child, `tests/visual/${owner}.mjs`, ...(id === 'shell' ? ['--wu17-regression'] : [])];
 const command = `${argv.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ')}\n`;
 fs.writeFileSync(`${output}/${id}.command.txt`, command, { flag: 'wx' });
 const out = fs.openSync(`${output}/${id}.stdout`, 'wx'), err = fs.openSync(`${output}/${id}.stderr`, 'wx'), startedAt = new Date().toISOString();
 const result = spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', out, err] }); fs.closeSync(out); fs.closeSync(err);
 report.commands.push({ id, child, argv, startedAt, finishedAt: new Date().toISOString(), exitStatus: result.status, signal: result.signal, error: result.error?.code ?? null, command: record(`${output}/${id}.command.txt`), stdout: record(`${output}/${id}.stdout`), stderr: record(`${output}/${id}.stderr`), status: result.status === 0 ? 'passed' : 'failed' });
 save(); console.log(`${id}: ${result.status === 0 ? 'passed' : 'failed'}`);
}
report.status = report.commands.length === matrix.length && report.commands.every(row => row.status === 'passed') ? 'passed' : 'failed'; save();
if (report.status !== 'passed') process.exitCode = 1;
