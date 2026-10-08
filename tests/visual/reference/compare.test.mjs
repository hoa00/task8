import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareImages, validateBaseline } from './compare.mjs';

test('missing reference fails without creating a golden', () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'gr8r-comparator-'));
  try {
    assert.throws(() => validateBaseline(directory), /Missing reference manifest/);
    assert.throws(() => compareImages(join(directory, 'missing.png'), join(directory, 'actual.png')), /Missing reference/);
    assert.equal(existsSync(join(directory, 'missing.png')), false);
  } finally { rmSync(directory, { recursive: true }); }
});

test('one changed pixel fails the exact comparison including antialiasing', () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'gr8r-pixels-'));
  try {
    const image = new PNG({ width: 2, height: 2 });
    image.data.fill(255);
    writeFileSync(join(directory, 'reference.png'), PNG.sync.write(image));
    assert.equal(compareImages(join(directory, 'reference.png'), join(directory, 'reference.png')).diffPixels, 0);
    image.data[0] = 0;
    writeFileSync(join(directory, 'actual.png'), PNG.sync.write(image));
    assert.equal(compareImages(join(directory, 'reference.png'), join(directory, 'actual.png')).diffPixels, 1);
  } finally { rmSync(directory, { recursive: true }); }
});

test('comparison CLI rejects snapshot update flags before touching a reference', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./compare.mjs', import.meta.url)), '--update-snapshots'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Comparator forbids snapshot updates/);
});
