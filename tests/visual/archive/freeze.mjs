import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../reference/source-check.mjs';
const root = 'docs/poc/evidence/WU-28', attempt = process.argv[2];
if (!attempt) throw Error('Unique freeze attempt required');
const output = `${root}/${attempt}-freeze.json`;
if (fs.existsSync(output)) throw Error('Never overwrite a freeze');
const files = {};
function walk(dir) { if (fs.statSync(dir).isFile()) { files[dir] = sha256(fs.readFileSync(dir)); return; } for (const row of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, row.name); if (row.isDirectory()) walk(file); else files[file] = sha256(fs.readFileSync(file)); } }
for (const directory of process.argv.slice(3)) {
  if (!directory.startsWith(`${root}/`)) throw Error('Only owned WU28 files');
  if (directory.startsWith(`${root}/raw/`) && !fs.existsSync(`${directory}/execution.json`)) throw Error('Only completed finite raw child files');
  walk(directory);
}
fs.writeFileSync(output, JSON.stringify({ status: 'FrozenActualFiniteCompletedBytes', attempt, count: Object.keys(files).length, scope: 'Explicit completed child directories; excludes this manifest and its running outer wrapper. No self-growing stdout freeze.', files }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ attempt, files: Object.keys(files).length }));
