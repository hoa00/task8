import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { artifacts, checkSource, sha256 } from '../reference/source-check.mjs';

const root = 'docs/poc/evidence/WU-19', output = `${root}/visual-verification.json`;
if (fs.existsSync(output)) throw Error('Never overwrite offline verification');
const read = path => JSON.parse(fs.readFileSync(path));
const inputs = () => Object.fromEntries(['baseline-manifest.json', 'font-assets.json', 'source-fixture.json', 'source-lock.json'].map(name => [name, sha256(fs.readFileSync(`${artifacts}/${name}`))]));
const old = read(`${root}/attempts/matrix-02/report.json`), categories = read(`${root}/attempts/categories-01/report.json`), latest = read(`${root}/attempts/updates-mobile-01/report.json`), defaults = read(`${root}/attempts/defaults-01/report.json`);
assert.equal(old.status, 'failed'); assert.equal(old.samples.length, 35); assert.equal(old.samples.filter(row => row.changedPixels > 0).length, 8);
assert.equal(categories.status, 'failed'); assert.equal(categories.samples.length, 8); assert.equal(categories.samples.filter(row => row.changedPixels > 0).length, 1);
assert.equal(latest.status, 'passed'); assert.equal(latest.samples.length, 1); assert.equal(defaults.status, 'failed'); assert.equal(defaults.samples.length, 2);
const samples = old.samples.map(row => {
  const current = latest.samples.find(item => item.id === row.id), bridge = categories.samples.find(item => item.id === row.id);
  const chosen = current ?? bridge ?? row, attempt = current ? 'updates-mobile-01' : bridge ? 'categories-01' : 'matrix-02';
  assert.equal(chosen.changedPixels, 0); assert.equal(chosen.repeatabilityPixels, 0); assert.equal(chosen.geometryEqual, true);
  const directory = `${root}/attempts/${attempt}`;
  const png = Object.fromEntries(['source', 'target', 'source-repeat', 'target-repeat'].map(side => [side, fs.readFileSync(`${directory}/${chosen.id}-${side}.png`)]));
  for (const [side, key] of [['source', 'sourceSha256'], ['target', 'targetSha256'], ['source-repeat', 'sourceRepeatSha256'], ['target-repeat', 'targetRepeatSha256']]) assert.equal(sha256(png[side]), chosen[key]);
  const comparisons = [['source', 'target'], ['source', 'source-repeat'], ['target', 'target-repeat']].map(([a, b]) => { const x = PNG.sync.read(png[a]), y = PNG.sync.read(png[b]); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const changed = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0, includeAA: true }); assert.equal(changed, 0); return { a, b, changedPixels: changed }; });
  const sourceFonts = chosen.fonts.sourceRequests.filter(row => /\.woff2(?:\?|$)/.test(row.url)), targetFonts = chosen.fonts.targetResponses;
  assert.equal(sourceFonts.length, 2); assert.equal(targetFonts.length, 2); assert.deepEqual(sourceFonts.map(row => row.sha256).sort(), targetFonts.map(row => row.sha256).sort()); assert.ok([...sourceFonts, ...targetFonts].every(row => row.status === 200)); assert.ok(chosen.fonts.loaded.every(rows => rows.length === 4 && rows.every(row => row.status === 'loaded')));
  return { id: chosen.id, attempt, report: `${directory}/report.json`, pngSha256: Object.fromEntries(Object.entries(png).map(([side, bytes]) => [side, sha256(bytes)])), comparisons, fonts: { sourceResponses: 2, targetResponses: 2, byteEqual: true, status200: true, loadedSpecsPerSide: 4 } };
});
for (const report of [old, categories, latest]) { assert.deepEqual(report.immutableBefore, inputs()); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.implementationAssetsBefore, report.implementationAssetsAfter); assert.equal(report.threshold, 0); assert.equal(report.includeAA, true); assert.equal(report.maxDiffPixels, 0); assert.deepEqual(report.masks, []); assert.ok(report.runtime.profile.actualLaunchArguments.includes('--disable-partial-raster')); }
for (const [name, hash] of Object.entries(latest.implementationAssetsAfter)) assert.equal(sha256(fs.readFileSync(name)), hash, name);
const diff = (a, b) => ({ changed: Object.keys(a).filter(name => name in b && a[name] !== b[name]), removed: Object.keys(a).filter(name => !(name in b)), added: Object.keys(b).filter(name => !(name in a)) });
const stages = [['category-counts', old, categories, 'build-before-category-counts'], ['tabs-scroll', categories, latest, 'build-before-tabs-scroll']].map(([id, before, after, archive]) => {
  const differences = diff(before.implementationAssetsAfter, after.implementationAssetsBefore), productionChanged = differences.changed.filter(name => name !== 'package.json' && !name.startsWith('apps/web/dist/'));
  assert.deepEqual(productionChanged, ['apps/web/src/features/notifications/InboxPage.tsx']); assert.ok([...differences.added, ...differences.removed].every(name => name.startsWith('apps/web/dist/')));
  const bytes = fs.readFileSync(`${root}/${archive}/InboxPage.tsx`); assert.equal(sha256(bytes), before.implementationAssetsAfter['apps/web/src/features/notifications/InboxPage.tsx']);
  for (const [name, hash] of Object.entries(before.implementationAssetsAfter).filter(([name]) => name.startsWith('apps/web/dist/'))) assert.equal(sha256(fs.readFileSync(name.replace('apps/web/dist/', `${root}/${archive}/dist/`))), hash);
  return { id, archive: `${root}/${archive}`, differences, productionChanged, archiveBytesVerified: true };
});
const code0 = fs.readFileSync(`${root}/build-before-category-counts/InboxPage.tsx`, 'utf8'), code1 = fs.readFileSync(`${root}/build-before-tabs-scroll/InboxPage.tsx`, 'utf8'), current = fs.readFileSync('apps/web/src/features/notifications/InboxPage.tsx', 'utf8');
assert.equal(code0.replaceAll("model.records.filter(notification => (row.value === 'all' || notification.type === row.value) && !notification.readAt).length", "records.filter(notification => (row.value === 'all' || notification.type === row.value) && !notification.readAt).length"), code1);
assert.equal(code1.replace('useRef, useState, useSyncExternalStore', 'useLayoutEffect, useRef, useState, useSyncExternalStore').replace('preview = useRef<HTMLDivElement>(null);', 'preview = useRef<HTMLDivElement>(null), tabs = useRef<HTMLDivElement>(null);').replace('  const { hostRef, onAnimationEnd }', '  useLayoutEffect(() => { if (tabs.current) tabs.current.scrollLeft = 0; }, [category, unread, model.query.dataUpdatedAt]);\n  const { hostRef, onAnimationEnd }').replace('<Tabs className="inbox-tabs', '<Tabs ref={tabs} className="inbox-tabs'), current);
const packageBefore = JSON.parse(fs.readFileSync('package.json')); delete packageBefore.scripts['test:notifications:defaults']; assert.equal(sha256(Buffer.from(JSON.stringify(packageBefore, null, 2) + '\n')), old.implementationAssetsAfter['package.json']);
assert.deepEqual(defaults.immutableBefore, inputs()); assert.deepEqual(defaults.immutableAfter, inputs());
let defaultComparisons = 0;
for (const sample of defaults.samples) for (const [a, b] of [['source', 'target'], ['source', 'source-repeat'], ['target', 'target-repeat']]) { const x = PNG.sync.read(fs.readFileSync(`${root}/attempts/defaults-01/drawer-composer-${sample.width}-${a}.png`)), y = PNG.sync.read(fs.readFileSync(`${root}/attempts/defaults-01/drawer-composer-${sample.width}-${b}.png`)); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const actual = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0, includeAA: true }); assert.equal(actual, a === 'source' && b === 'target' ? sample.changedPixels : 0); defaultComparisons++; }
checkSource();
const report = { status: 'passed', scope: 'Explicit aggregate:27 archived matrix02 pairs +7 archived category bridge pairs +1 current Updates390 pair. Two exact Inbox-only production deltas/build archives. Not a new successful full35 current capture.', qualifiedPairs: 35, originalAndRepeatPng: 140, offlineComparisons: samples.length * 3, strictChangedPixels: 0, repeatabilityPixels: 0, samples, stages, packageMetadataDifference: 'Only extra test:notifications:defaults QA script; exact prior metadata hash reconstructed and verified, not an original saved package byte archive.', currentAssetCount: Object.keys(latest.implementationAssetsAfter).length, currentAssetMap: latest.implementationAssetsAfter, immutableInputs: inputs(), sharedDefaults: { geometryPairs: 2, geometryReport: `${root}/default-geometry-verification.json`, originalAndRepeatPng: 8, auditedOfflineComparisons: defaultComparisons, wholeComponentStrictStatus: 'unaccepted', strictChangedPixels: defaults.samples.map(row => ({ width: row.width, changedPixels: row.changedPixels })), report: `${root}/attempts/defaults-01/report.json`, scope: defaults.scope }, source: { sha: execFileSync('git', ['-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(), clean: !execFileSync('git', ['-C', '.reference/gr8r-studio', 'status', '--porcelain'], { encoding: 'utf8' }).trim() }, rootReview: 'pending' };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ pairs: samples.length, comparisons: samples.length * 3, defaultComparisons, currentAssets: report.currentAssetCount }));
