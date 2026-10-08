import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { artifacts, root, readJson, sha256 } from './source-check.mjs';

export function compareImages(referencePath, actualPath, diffPath) {
  if (!existsSync(referencePath)) throw new Error(`Missing reference: ${referencePath}`);
  if (!existsSync(actualPath)) throw new Error(`Missing actual: ${actualPath}`);
  const expected = PNG.sync.read(readFileSync(referencePath));
  const actual = PNG.sync.read(readFileSync(actualPath));
  if (expected.width !== actual.width || expected.height !== actual.height) throw new Error('Image dimensions differ');
  const diff = new PNG({ width: expected.width, height: expected.height });
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: 0, includeAA: true });
  if (diffPixels && diffPath) writeFileSync(diffPath, PNG.sync.write(diff));
  return { diffPixels, totalPixels: expected.width * expected.height };
}

export function validateBaseline(directory) {
  const path = join(directory, 'baseline-manifest.json');
  if (!existsSync(path)) throw new Error(`Missing reference manifest: ${path}`);
  const manifest = readJson(path);
  if (manifest.status !== 'ready' || manifest.cases.length !== manifest.scenarioCount) throw new Error('Reference is incomplete');
  for (const asset of manifest.inputs) {
    const bytes = readFileSync(join(directory, asset.path));
    if (sha256(bytes) !== asset.sha256) throw new Error(`Reference input hash differs: ${asset.path}`);
  }
  for (const entry of manifest.cases) {
    if (sha256(readFileSync(join(directory, entry.screenshot))) !== entry.sha256) throw new Error(`Reference screenshot hash differs: ${entry.id}`);
    if (sha256(readFileSync(join(directory, entry.metadata))) !== entry.metadataSha256) throw new Error(`Reference metadata hash differs: ${entry.id}`);
  }
  return manifest;
}

export function compareManifests(baselineDirectory, actualDirectory, diffDirectory) {
  const baseline = validateBaseline(baselineDirectory);
  const actual = readJson(join(actualDirectory, 'baseline-manifest.json'));
  if (actual.status !== 'ready' || actual.cases.length !== baseline.cases.length) throw new Error('Actual capture is incomplete');
  for (const key of ['sourceCommit', 'environment', 'runner', 'captureOptions', 'fixtureSha256', 'fontManifestSha256', 'registrySha256']) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(actual[key])) throw new Error(`Capture metadata mismatch: ${key}`);
  }
  mkdirSync(diffDirectory, { recursive: true });
  return baseline.cases.map(entry => {
    const received = actual.cases.find(item => item.id === entry.id);
    if (!received) throw new Error(`Missing actual scenario: ${entry.id}`);
    if (sha256(readFileSync(join(actualDirectory, received.screenshot))) !== received.sha256) throw new Error(`Actual hash differs: ${entry.id}`);
    if (sha256(readFileSync(join(actualDirectory, received.metadata))) !== received.metadataSha256) throw new Error(`Actual metadata hash differs: ${entry.id}`);
    const metrics = compareImages(join(baselineDirectory, entry.screenshot), join(actualDirectory, received.screenshot), join(diffDirectory, `${entry.id}.png`));
    return { id: entry.id, ...metrics, status: metrics.diffPixels ? 'failed' : 'passed' };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.some(arg => /update|^-u$/.test(arg))) throw new Error('Comparator forbids snapshot updates');
  const actualDirectory = process.argv[2];
  if (!actualDirectory) throw new Error('Provide an actual capture directory containing baseline-manifest.json; this command never captures or writes reference images');
  const manifestBefore = sha256(readFileSync(`${artifacts}/baseline-manifest.json`));
  const results = compareManifests(artifacts, actualDirectory, `${root}test-results/compare-diffs`);
  if (sha256(readFileSync(`${artifacts}/baseline-manifest.json`)) !== manifestBefore) throw new Error('Reference was mutated');
  writeFileSync(`${root}test-results/comparison.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ cases: results.length, failed: results.filter(item => item.status === 'failed').length }));
  if (results.some(item => item.status === 'failed')) process.exitCode = 1;
}
