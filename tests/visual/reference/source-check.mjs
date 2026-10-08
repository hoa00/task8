import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const reference = `${root}.reference/gr8r-studio`;
export const artifacts = `${root}docs/poc/reference`;
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const git = (...args) => execFileSync('git', ['-C', reference, ...args], { encoding: 'utf8' }).trim();

export function checkSource() {
  const lock = readJson(`${artifacts}/source-lock.json`);
  if (git('rev-parse', 'HEAD') !== lock.git.commitSha) throw new Error('Source HEAD differs from pinned SHA');
  if (git('rev-parse', 'HEAD^{tree}') !== lock.git.treeSha) throw new Error('Source tree differs');
  if (git('status', '--porcelain')) throw new Error('Reference working tree is not clean');
  const inventoryBytes = readFileSync(`${artifacts}/source-inventory.json`);
  if (sha256(inventoryBytes) !== lock.inventory.sha256) throw new Error('Source inventory digest differs');
  const inventory = JSON.parse(inventoryBytes);
  for (const file of inventory.files) {
    if (sha256(readFileSync(`${reference}/${file.path}`)) !== file.sha256) throw new Error(`Source hash differs: ${file.path}`);
  }
  return { commit: lock.git.commitSha, tree: lock.git.treeSha, verifiedFiles: inventory.files.length, clean: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkSource(), null, 2));
