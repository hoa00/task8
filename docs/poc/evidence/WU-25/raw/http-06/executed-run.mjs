import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
const mode = process.argv[2], root = 'docs/poc/evidence/WU-25';
if (!attempt || !['source', 'verify', 'interactions', 'http', 'gates', 'closure'].includes(mode)) throw Error('Explicit mode and unique attempt required');
const raw = `${root}/raw/${attempt}`;
if (fs.existsSync(raw)) throw Error('Never overwrite raw execution');
fs.mkdirSync(raw, { recursive: true });
const records = [];
function execute(id, args) {
  const stdout = `${raw}/${id}.stdout`, stderr = `${raw}/${id}.stderr`;
  const out = fs.openSync(stdout, 'wx'), err = fs.openSync(stderr, 'wx');
  const run = spawnSync(process.execPath, args, { stdio: ['ignore', out, err] });
  fs.closeSync(out); fs.closeSync(err);
  records.push({ id, command: [process.execPath, ...args], exitStatus: run.status, error: run.error?.code ?? null, stdout: { path: stdout, bytes: fs.statSync(stdout).size, sha256: sha256(fs.readFileSync(stdout)) }, stderr: { path: stderr, bytes: fs.statSync(stderr).size, sha256: sha256(fs.readFileSync(stderr)) } });
  fs.writeFileSync(`${raw}/execution.json`, JSON.stringify({ node: process.version, records }, null, 2) + '\n');
  return run.status;
}
fs.copyFileSync('tests/visual/settings/security-run.mjs', `${raw}/executed-run.mjs`);
const status = execute(mode, [`tests/visual/settings/security-${mode}.mjs`, ...process.argv.slice(3)]);
const archived = execute('archive', ['tests/visual/settings/security-archive.mjs', `--attempt=${attempt}`]);
const frozen = execute('freeze', ['tests/visual/settings/security-freeze.mjs', `--attempt=${attempt}`]);
const archiveFrozen = execute('archive-freeze', ['tests/visual/settings/security-freeze.mjs', `--attempt=${attempt}-archive`, `--directory=archives/${attempt}`]);
// All child writers are closed and execution.json has its final bytes. The
// runner's own stdout is deliberately outside this immutable raw directory.
const rawFiles = Object.fromEntries(fs.readdirSync(raw).sort().map(name => [`${raw}/${name}`, sha256(fs.readFileSync(`${raw}/${name}`))]));
fs.writeFileSync(`${root}/${attempt}-raw-freeze.json`, JSON.stringify({ status: 'FrozenActualExecutedRawBytes', attempt, files: rawFiles }, null, 2) + '\n');
console.log(JSON.stringify({ mode, attempt, actualExitStatus: status, archived, frozen, archiveFrozen }));
process.exitCode = status || archived || frozen || archiveFrozen || 0;
