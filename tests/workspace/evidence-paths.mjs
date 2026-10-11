import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const evidenceRelocations = JSON.parse(readFileSync(
  resolve(root, 'docs/poc/evidence/path-relocations.json'), 'utf8',
));
const relocated = new Map(evidenceRelocations.files.map(row => [resolve(root, row.originalPath), row]));

// Consult exact historical names first: existsSync alone aliases the other probe on macOS.
export function resolveEvidencePath(path) {
  const absolute = resolve(root, path);
  const row = relocated.get(absolute);
  return row ? resolve(root, row.currentPath) : absolute;
}

export function readEvidenceFile(path) {
  const bytes = readFileSync(resolveEvidencePath(path));
  const row = relocated.get(resolve(root, path));
  if (row) {
    assert.equal(bytes.length, row.bytes, row.originalPath);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, row.originalPath);
  }
  return bytes;
}
