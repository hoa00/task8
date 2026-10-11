import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkTrackedPaths, validatePortablePaths } from './tracked-paths.mjs';
import { evidenceRelocations, readEvidenceFile, resolveEvidencePath } from './evidence-paths.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('portable paths reject case and Unicode collisions including parent directories', () => {
  assert.throws(() => validatePortablePaths(['Rebalance.json', 'rebalance.json']), /collision/);
  assert.throws(() => validatePortablePaths(['Evidence/a.json', 'evidence/b.json']), /collision/);
  assert.throws(() => validatePortablePaths(['caf\u00e9.json', 'cafe\u0301.json']), /collision/);
  assert.doesNotThrow(() => validatePortablePaths(['evidence/rebalance-project.json', 'evidence/rebalance.json']));
});

test('repository paths can coexist in a case-insensitive checkout', () => {
  assert.equal(checkTrackedPaths().status, 'passed');
});

test('relocated evidence preserves Git blobs and both distinct historical probe responses', () => {
  assert.equal(evidenceRelocations.files.length, 9);
  for (const row of evidenceRelocations.files) {
    const path = resolveEvidencePath(row.originalPath);
    assert(readdirSync(dirname(path)).includes(basename(path)), row.currentPath);
    const original = execFileSync('git', ['cat-file', 'blob', row.blob], { cwd: root });
    assert.deepEqual(readEvidenceFile(row.originalPath), original, row.originalPath);
    assert.deepEqual(readFileSync(path), original, row.currentPath);
  }
  const directories = new Set(evidenceRelocations.files.map(row => dirname(row.originalPath)));
  for (const directory of directories) {
    const report = JSON.parse(readEvidenceFile(`${directory}/report.json`));
    for (const name of ['Rebalance', 'rebalance']) {
      const probe = report.probes.find(row => row.name === name);
      assert(probe, `${directory}: ${name}`);
      const metadata = JSON.parse(readEvidenceFile(`${directory}/${probe.evidence}`));
      const raw = JSON.parse(readEvidenceFile(`${directory}/${name}.response.json`));
      assert.equal(metadata.path, probe.path);
      assert.equal(metadata.status, probe.status);
      assert.deepEqual(metadata.response, raw);
      assert.deepEqual(JSON.parse(metadata.body), JSON.parse(readEvidenceFile(`${directory}/${name}.request.json`)));
      assert(name === 'Rebalance' ? raw.data.project : raw.data.task);
    }
  }
});
