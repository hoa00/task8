import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sha256, readJson, artifacts, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { createSeedDataset } from '../../../apps/web/src/data/mock/seed.ts';
const root = 'docs/poc/evidence/WU-26', attempt = process.argv[2], visualAttempt = process.argv[3];
const nativeAttempt = process.argv[4] ?? 'native-06', motionAttempt = process.argv[5] ?? 'motion-01', httpAttempt = process.argv[6] ?? 'http-01';
const currentVisualAttempt = process.argv[7] ?? 'base-01';
const output = `${root}/attempts/${attempt}`;
if (!attempt || !visualAttempt || fs.existsSync(output)) throw Error('Unique attempt and actual final visual required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const read = file => JSON.parse(fs.readFileSync(file));
const record = file => { const bytes = fs.readFileSync(file); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const validate = file => { assert.deepEqual(record(file.path), file); };
const current = { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() };
const activeFonts = new Map([['9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608', 29288], ['23840067d1dda8749b421a47c3e56205fa78c0d58d40baf3cc4d625fbe667f36', 9872]]);
const report = { status: 'running', assets: current, immutable: immutableInputs(), visual: [], native: [], motion: [], http: [], raw: [], freezes: [], archives: [], scope: 'Current WU26 bounded acceptance only. Whole natural viewport Auth surfaces; long mobile signup footer separately reached by actual wheel. Static first-appearance settled lifecycle; clock-projected loading/cooldown and separate live timing probes. Linux qualified BOTH raster flag only. No recovery of inherited WU29 debt.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
function fonts(responses, loaded) { for (const rows of responses) { assert.equal(rows.length, 2); assert.deepEqual(new Set(rows.map(row => row.sha256)), new Set(activeFonts.keys())); for (const row of rows) { assert.equal(row.status, 200); assert.equal(row.bytes, activeFonts.get(row.sha256)); } } for (const faces of loaded) { assert.equal(faces.length, 4); assert.deepEqual(faces.map(face => `${face.family}:${face.weight}:${face.status}`).sort(), ['Geist Mono:400:loaded', 'Geist:400:loaded', 'Geist:500:loaded', 'Geist:600:loaded'].sort()); } }
function strict(a, b) { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); assert.equal(pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0, includeAA: true }), 0); return x; }
try {
  const visual = read(`${root}/attempts/${visualAttempt}/report.json`);
  const archived = read(`${root}/archives/final-02/manifest.json`).files;
  const changed = [...new Set([...Object.keys(archived), ...Object.keys(current)])].filter(path => archived[path] !== current[path]);
  const codePath = 'apps/web/src/features/auth/AuthPage.tsx';
  assert.deepEqual(changed.filter(path => !path.startsWith('apps/web/dist')), [codePath]);
  const oldCode = fs.readFileSync(`${root}/archives/final-02/${codePath}`, 'utf8');
  const mechanical = read(`${root}/mechanical-bridge.json`); assert.equal(sha256(Buffer.from(oldCode)), mechanical.beforeSha256);
  let expectedCode = oldCode; for (const transform of mechanical.transformations) { assert.equal(expectedCode.split(transform.before).length - 1, transform.occurrences); expectedCode = expectedCode.replaceAll(transform.before, transform.after); }
  assert.equal(fs.readFileSync(codePath, 'utf8'), expectedCode);
  assert.equal(sha256(Buffer.from(expectedCode)), mechanical.afterSha256);
  assert.ok(changed.filter(path => path !== codePath).every(path => /\.(js|html)$/.test(path)));
  report.bridge = { oldArchive: record(`${root}/archives/final-02/manifest.json`), currentArchive: record(`${root}/archives/final-03/manifest.json`), transformations: record(`${root}/mechanical-bridge.json`), oldAssets: Object.keys(archived).length, currentAssets: Object.keys(current).length, changedPaths: changed.map(path => ({ path, before: archived[path] ?? null, after: current[path] ?? null })), exactLocalCancelAndMechanicalJSXChange: true, scope: 'Only synchronous go cancellation/pending clear/scoped focus plus typed JSX event boundaries rendering identical button/Button markup/classes/props. No static copy/layout/styles/Source/font/facade/contracts change. Selected44=archived30 nonbase plus current14 all-seven base. Current native valid transitions/cancel/focus cover affected behavior; old44 not relabeled fresh current.' };
  assert.deepEqual(read(`${root}/archives/final-03/manifest.json`).files, current);
  assert.equal(visual.status, 'passed'); assert.equal(visual.samples.length, 44); assert.deepEqual(visual.assetsBefore, archived); assert.deepEqual(visual.assetsAfter, archived); assert.deepEqual(visual.immutableBefore, report.immutable); assert.deepEqual(visual.immutableAfter, report.immutable);
  const fresh = read(`${root}/attempts/${currentVisualAttempt}/report.json`); assert.equal(fresh.status, 'passed'); assert.equal(fresh.samples.length, 14); assert.deepEqual(fresh.assetsBefore, current); assert.deepEqual(fresh.assetsAfter, current); assert.deepEqual(fresh.immutableBefore, report.immutable); assert.deepEqual(fresh.immutableAfter, report.immutable);
  const original = readJson(`${artifacts}/source-fixture.json`), seed = createSeedDataset();
  const selected = [...visual.samples.filter(sample => sample.sample.state !== 'base').map(sample => ({ sample, provenance: 'Archived exact pre-cancel/mechanical-JSX bytes plus independently verified bounded bridge' })), ...fresh.samples.map(sample => ({ sample, provenance: 'Current all-seven desktop/mobile base' }))]; assert.equal(selected.length, 44);
  for (const { sample, provenance } of selected) {
    assert.equal(sample.changedPixels, 0); assert.equal(sample.sourceRepeatPixels, 0); assert.equal(sample.targetRepeatPixels, 0);
    for (const file of [...sample.images, sample.sourceFixture, sample.targetFixture, sample.captureStates]) validate(file);
    assert.deepEqual(read(sample.sourceFixture.path), original);
    const target = read(sample.targetFixture.path); assert.deepEqual(target.dataset, seed); assert.equal(target.scenario, sample.sample.state === 'login-error' ? 'login-error' : 'normal');
    const bytes = sample.images.map(file => fs.readFileSync(file.path)); const png = strict(bytes[0], bytes[1]); strict(bytes[0], bytes[2]); strict(bytes[1], bytes[3]);
    assert.deepEqual(sample.boxes[0], sample.boxes[1]); assert.deepEqual(sample.clips[0], sample.clips[1]);
    for (const [index, box] of sample.boxes.entries()) { const height = sample.sample.width === 1440 ? 1000 : 844; assert.deepEqual(sample.clips[index], { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.min(sample.sample.width, Math.ceil(box.x + box.width)) - Math.floor(box.x), height: Math.min(height, Math.ceil(box.y + box.height)) - Math.floor(box.y) }); assert.equal(png.width, sample.clips[index].width); assert.equal(png.height, sample.clips[index].height); }
    fonts(sample.fonts.responses, sample.fonts.loaded); report.visual.push({ id: sample.sample.id, provenance, images: sample.images, sourceFixture: sample.sourceFixture, targetFixture: sample.targetFixture, captureStates: sample.captureStates, strictComparisons: 3, pixels: 0 });
  }
  for (const name of [nativeAttempt, motionAttempt, httpAttempt]) {
    const file = `${root}/attempts/${name}/report.json`, result = read(file); assert.equal(result.status, 'passed');
    const expected = name === motionAttempt ? current : Object.fromEntries(Object.entries(current).filter(([path]) => !path.startsWith('.reference/')));
    assert.deepEqual(result.assetsBefore, expected); assert.deepEqual(result.assetsAfter, expected); assert.deepEqual(result.immutableBefore, report.immutable); assert.deepEqual(result.immutableAfter, report.immutable);
    if (name === motionAttempt) { assert.equal(result.probes.length, 3); for (const probe of result.probes) { for (const side of probe.pair) validate(side.initialFixture); fonts(probe.pair.map(side => side.fonts), probe.pair.map(side => side.loadedFaces)); assert.deepEqual(probe.pair[0].timing.map(({ duration, delay, easing, frames }) => ({ duration, delay, easing, frames })), probe.pair[1].timing.map(({ duration, delay, easing, frames }) => ({ duration, delay, easing, frames }))); } report.motion.push(record(file)); }
    else if (name === nativeAttempt) { assert.equal(result.probes.length, 7); report.native.push(record(file)); }
    else { const paths = new Set(); for (const request of result.requests) { assert.equal(request.outcome, 'passed'); assert.equal(request.method, 'GET'); for (const stored of [request.before, request.after]) { validate(stored); assert.ok(!paths.has(stored.path)); paths.add(stored.path); } const before = read(request.before.path), after = read(request.after.path); if (request.operation === 'getSession') { before.data.capabilities.dataMode = 'http'; before.data.capabilities.features.authentication = 'unavailable'; } assert.deepEqual(before, after); } assert.equal(result.probes.length, 3); report.http.push({ report: record(file), requestFiles: paths.size, allUniqueRehashed: true }); }
  }
  const gates = read(`${root}/attempts/core-08/report.json`); assert.equal(gates.status, 'passed'); assert.equal(gates.commands.length, 7); for (const command of gates.commands) { assert.equal(command.exitStatus, 0); validate(command.stdout); validate(command.stderr); } report.gates = record(`${root}/attempts/core-08/report.json`);
  for (const id of fs.readdirSync(`${root}/raw`).sort()) { if (id === attempt) continue; const executionPath = `${root}/raw/${id}/execution.json`; assert.ok(fs.existsSync(executionPath), id); const execution = read(executionPath); for (const file of [execution.command, execution.stdout, execution.stderr]) validate(file); report.raw.push({ execution: record(executionPath), exitStatus: execution.exitStatus }); }
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('-freeze.json'))) { const frozen = read(`${root}/${name}`); for (const [file, hash] of Object.entries(frozen.files)) assert.equal(record(file).sha256, hash); report.freezes.push({ manifest: record(`${root}/${name}`), files: Object.keys(frozen.files).length }); }
  for (const name of fs.readdirSync(`${root}/archives`)) { const manifest = read(`${root}/archives/${name}/manifest.json`); for (const [file, hash] of Object.entries(manifest.files)) assert.equal(record(`${root}/archives/${name}/${file}`).sha256, hash); report.archives.push({ name, manifest: record(`${root}/archives/${name}/manifest.json`), assets: Object.keys(manifest.files).length }); }
  checkSource(); assert.deepEqual(current, { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }); assert.deepEqual(report.immutable, immutableInputs()); report.counts = { selectedVisualPairs: 44, archivedQualifiedVisualPairs: 30, currentVisualPairs: 14, strictComparisons: 132, PNGs: 176, fixtureFiles: 88, actualBoundedStateFiles: 44, actualWoffResponses: 176, contextsWithFourLoadedFaces: 88, currentNative: 7, currentMotionModes: 3, currentHTTP: 3, rawExecutions: report.raw.length, archives: report.archives.length };
  report.status = 'passed'; save(); console.log(JSON.stringify({ status: report.status, ...report.counts }));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
