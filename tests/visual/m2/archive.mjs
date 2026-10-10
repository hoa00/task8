import fs from 'node:fs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/archives/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique archive required');
fs.mkdirSync(output, { recursive: true });
const records = [];
for (const [originalPath, expected] of Object.entries({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() })) {
  const bytes = fs.readFileSync(originalPath), hash = sha256(bytes);
  if (hash !== expected) throw Error(`Changed asset: ${originalPath}`);
  const path = `${output}/files/${originalPath}`;
  fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(path, bytes, { flag: 'wx' }); records.push({ originalPath, path, bytes: bytes.length, sha256: hash });
}
fs.writeFileSync(`${output}/manifest.json`, `${JSON.stringify({ status: 'archived-actual-bytes', immutableInputs: immutableInputs(), files: records }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ attempt, count: records.length, bytes: records.reduce((sum, row) => sum + row.bytes, 0) }));
