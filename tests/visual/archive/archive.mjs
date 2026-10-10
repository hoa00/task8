import fs from 'node:fs';
import path from 'node:path';
import { implementationAssets, httpBuildAssets, sourceAssets, immutableInputs } from '../settings/assets.mjs';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv[2], root = `docs/poc/evidence/WU-28/archives/${attempt}`;
if (!attempt || fs.existsSync(root)) throw Error('Unique archive required');
const files = { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() };
for (const [file, hash] of Object.entries(files)) { const bytes = fs.readFileSync(file); if (sha256(bytes) !== hash) throw Error(file); const target = `${root}/${file}`; fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' }); }
fs.writeFileSync(`${root}/manifest.json`, JSON.stringify({ files, immutableInputs: immutableInputs(), count: Object.keys(files).length }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ attempt, count: Object.keys(files).length }));
