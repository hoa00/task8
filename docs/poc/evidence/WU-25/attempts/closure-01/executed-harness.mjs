import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { artifacts, sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from './assets.mjs';

const root = 'docs/poc/evidence/WU-25';
const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('Unique closure attempt required');
const output = `${root}/attempts/${attempt}`;
if (fs.existsSync(output)) throw Error('Never overwrite evidence');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync('tests/visual/settings/security-closure.mjs', `${output}/executed-harness.mjs`);
const read = path => JSON.parse(fs.readFileSync(path));
const record = path => { const bytes = fs.readFileSync(path); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const report = { status: 'running', scope: 'Qualified immutable archived captures plus current affected captures, exact production bridge, persisted raw bytes and real statuses. No fresh entire-matrix, real backend, Darwin, physical-device, full-shell or full-project parity claim.', visual: [], http: [], native: [], freezes: [], raw: [], rejected: [], immutable: immutableInputs() };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
function validateFile(file) { const actual = record(file.path); assert.equal(actual.bytes, file.bytes, file.path); assert.equal(actual.sha256, file.sha256, file.path); }
function strict(a, b) { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); return pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0, includeAA: true }); }
const current = { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() };
const previous = read(`${root}/archives/core-06/manifest.json`).assets;
const changedPaths = [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(path => previous[path] !== current[path]).sort();
try {
  assert.equal(changedPaths.filter(path => !path.startsWith('apps/web/dist')).length, 1);
  assert.ok(changedPaths.includes('apps/web/src/features/settings/SecurityBilling.tsx'));
  const sourcePath = 'apps/web/src/features/settings/SecurityBilling.tsx';
  const oldText = fs.readFileSync(`${root}/archives/core-06/${sourcePath}`, 'utf8'), newText = fs.readFileSync(sourcePath, 'utf8');
  const expected = oldText.replace('disabled={disabled} pending={pending} error={error}', 'disabled={disabled} inputDisabled={!enabled} pending={pending} error={error}').replace('interface PasswordSettingsProps { disabled: boolean; pending:', 'interface PasswordSettingsProps { disabled: boolean; inputDisabled: boolean; pending:').replace('function PasswordSettings({ disabled, pending, error, onSubmit }', 'function PasswordSettings({ disabled, inputDisabled, pending, error, onSubmit }');
  const start = expected.indexOf('function PasswordSettings('), end = expected.indexOf('export interface SessionRowProps');
  assert.equal(expected.slice(0, start) + expected.slice(start, end).replaceAll('autoComplete="current-password" disabled={disabled}', 'autoComplete="current-password" disabled={inputDisabled}').replaceAll('autoComplete="new-password" disabled={disabled}', 'autoComplete="new-password" disabled={inputDisabled}') + expected.slice(end), newText);
  report.bridge = { archivedMap: record(`${root}/archives/core-06/manifest.json`), currentArchiveMap: record(`${root}/archives/core-07/manifest.json`), previousCount: Object.keys(previous).length, currentCount: Object.keys(current).length, changedPaths: changedPaths.map(path => ({ path, before: previous[path] ?? null, after: current[path] ?? null })), exactSourceChangeVerified: true, scope: 'Only PasswordSettings input availability separated from submit pending guard. Pending keeps all three Source-shaped inputs enabled; HTTP unavailable inputs remain disabled. Source, facade, shared UI, other Settings source and emitted CSS unchanged; 22 generated JS/import/HTML paths changed (union includes removed and added paths). Older visual/native/HTTP captures remain actual archived captures.' };
  assert.deepEqual(read(`${root}/archives/core-07/manifest.json`).assets, current);
  const selected = [['matrix-01', sample => !sample.id.startsWith('2fa-setup-') && !/^password-(base|success)-/.test(sample.id)], ['focus-01', () => true], ['dark-01', () => true], ['boundaries-01', () => true], ['loading-02', () => true]];
  const originalBytes = fs.readFileSync(`${artifacts}/source-fixture.json`), original = JSON.parse(originalBytes);
  const activeFonts = new Set(['9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608', '23840067d1dda8749b421a47c3e56205fa78c0d58d40baf3cc4d625fbe667f36']);
  for (const [id, select] of selected) {
    const path = `${root}/attempts/${id}/report.json`, capture = read(path), archived = id !== 'loading-02';
    assert.deepEqual(capture.implementationAssetsBefore, archived ? previous : current);
    assert.deepEqual(capture.implementationAssetsAfter, capture.implementationAssetsBefore);
    assert.deepEqual(capture.immutableBefore, report.immutable); assert.deepEqual(capture.immutableAfter, report.immutable);
    for (const sample of capture.samples.filter(select)) {
      assert.equal(sample.changedPixels, 0); assert.equal(sample.sourceRepeatPixels, 0); assert.equal(sample.targetRepeatPixels, 0); assert.ok(sample.geometryEqual);
      assert.deepEqual(sample.ownedBoxes[0], sample.ownedBoxes[1]); assert.deepEqual(sample.clips[0], sample.clips[1]);
      const pngs = ['source', 'target', 'source-repeat', 'target-repeat'].map(side => record(`${root}/attempts/${id}/${sample.id}-${side}.png`));
      for (const [index, key] of ['sourceSha256', 'targetSha256', 'sourceRepeatSha256', 'targetRepeatSha256'].entries()) assert.equal(pngs[index].sha256, sample[key]);
      const bytes = pngs.map(file => fs.readFileSync(file.path));
      assert.equal(strict(bytes[0], bytes[1]), 0); assert.equal(strict(bytes[0], bytes[2]), 0); assert.equal(strict(bytes[1], bytes[3]), 0);
      for (const [box, clip] of sample.ownedBoxes.map((box, index) => [box, sample.clips[index]])) { assert.equal(clip.x, Math.floor(box.x)); assert.equal(clip.y, Math.floor(box.y)); assert.equal(clip.width, Math.min(sample.sample.width, Math.ceil(box.x + box.width)) - Math.floor(box.x)); assert.equal(clip.height, Math.min(sample.sample.width >= 899 ? 1000 : 844, Math.ceil(box.y + box.height)) - Math.floor(box.y)); }
      const fixture = sample.fixtureEvidence;
      validateFile({ path: fixture.sourceFixturePath, bytes: fixture.sourceFixtureBytes, sha256: fixture.sourceFixtureSha256 }); validateFile({ path: fixture.targetFixturePath, bytes: fixture.targetFixtureBytes, sha256: fixture.targetFixtureSha256 });
      assert.equal(fixture.originalFixtureSha256, sha256(originalBytes)); assert.equal(fixture.originalFixtureBytes, originalBytes.length);
      const actual = read(fixture.sourceFixturePath), expectedFixture = structuredClone(original); expectedFixture.prefs = actual.prefs;
      if (sample.sample.state === 'current-session') expectedFixture.data.sessions = expectedFixture.data.sessions.filter(session => session.cur);
      if (['enabled', 'disable-confirm'].includes(sample.sample.state)) expectedFixture.data.tfa = true;
      if (['free', 'business'].includes(sample.sample.state)) expectedFixture.data.plan = sample.sample.state === 'free' ? 'Free' : 'Business';
      assert.deepEqual(actual, expectedFixture);
      for (const side of ['sourceResponses', 'targetResponses']) { const fonts = sample.fonts[side].filter(font => /\.woff2(?:\?|$)/.test(font.url)); assert.equal(fonts.length, 2); assert.deepEqual(new Set(fonts.map(font => font.sha256)), activeFonts); assert.ok(fonts.every(font => font.status === 200 && font.bytes > 0)); }
      for (const faces of sample.fonts.loaded) { assert.equal(faces.length, 4); assert.ok(faces.every(face => face.status === 'loaded')); }
      if (sample.id.startsWith('2fa-setup-')) assert.ok(sample.activeElements.every(element => element.id === 'tfa-code'));
      report.visual.push({ attempt: id, id: sample.id, qualification: archived ? 'Archived exact predecessor plus verified bounded source/generated bridge' : 'Current affected-state capture', pngs, fixture: { source: fixture.sourceFixturePath, target: fixture.targetFixturePath }, strictComparisons: 3, changedPixels: 0 });
    }
  }
  for (const [id, select] of [['native-01', probe => !probe.id.startsWith('N25-02')], ['native-02', () => true]]) { const path = `${root}/attempts/${id}/report.json`, native = read(path); assert.equal(native.status, 'passed'); assert.deepEqual(native.assetsBefore, { ...implementationAssetsFrom(id), ...httpAssetsFrom(id) }); assert.deepEqual(native.assetsAfter, native.assetsBefore); report.native.push({ report: record(path), qualification: id === 'native-01' ? 'Eight archived unchanged probes under exact bounded bridge' : 'One current password pending/input/duplicate/completed probe', probes: native.probes.filter(select).map(probe => probe.id) }); }
  for (const id of ['http-04', 'http-05', 'http-06']) { const path = `${root}/attempts/${id}/report.json`, http = read(path), files = http.requests.flatMap(request => request.fixtureProjection ? [request.fixtureProjection.before, request.fixtureProjection.after] : []), unique = new Set(); assert.equal(http.status, 'passed'); assert.deepEqual(http.assetsBefore, {...implementationAssetsFrom(id),...httpAssetsFrom(id)}); assert.deepEqual(http.assetsAfter,http.assetsBefore); assert.equal(http.audit.writes, 0); assert.equal(http.audit.errors, 0); assert.equal(http.audit.pending, 0); assert.equal(http.principalBeforeSha256, http.principalAfterSha256); for (const file of files) { validateFile(file); assert.ok(!unique.has(file.path)); unique.add(file.path); } if (id !== 'http-04') { assert.ok(http.projectionByteAudit.reservedRequestIndices); assert.ok(http.projectionByteAudit.actualShaAndSizeVerified); } report.http.push({ report: record(path), qualification: id === 'http-04' ? 'Four archived HTTP probes plus exact bounded bridge, every original projected byte present' : 'Current bounded probe with reserved-index write-wx unique projected bytes', probes: http.probes.map(probe => probe.id), audit: http.audit, projectionFiles: files.length, uniquePaths: unique.size }); }
  const rejected = read(`${root}/attempts/http-03/report.json`); const mismatches = rejected.requests.flatMap(request => request.fixtureProjection ? [request.fixtureProjection.before, request.fixtureProjection.after] : []).filter(file => { const actual = record(file.path); return actual.bytes !== file.bytes || actual.sha256 !== file.sha256; });
  assert.equal(mismatches.length, 4);
  report.rejected.push({ attempt: 'http-03', executedStatus: 'passed', acceptance: 'FAILED_UNACCEPTED_WU29_PROJECTION_BYTES', report: record(`${root}/attempts/http-03/report.json`), mismatchReferences: mismatches, missingUniqueOriginalBodies: 2, expectedBytesPerOriginal: 33067, reason: 'Concurrent requests used mutable report.requests.length after await, overwriting projection-11 files. Two repeated listTasks requests reference four mismatched before/after files. The two old unique original bodies are absent; fresh execution does not recover or reconstruct them. Original raw/report/files/archive freezes remain immutable.' });
  const gates = read(`${root}/attempts/core-07/report.json`); assert.equal(gates.status, 'passed'); assert.equal(gates.commands.length, 7); for (const command of gates.commands) { assert.equal(command.exitStatus, 0); validateFile(command.stdout); validateFile(command.stderr); } report.gates = { report: record(`${root}/attempts/core-07/report.json`), commands: gates.commands.map(command => ({ id: command.id, exitStatus: command.exitStatus })) };
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('-freeze.json')).sort()) { const path = `${root}/${name}`, frozen = read(path); for (const [file, hash] of Object.entries(frozen.files)) assert.equal(record(file).sha256, hash, file); report.freezes.push({ manifest: record(path), files: Object.keys(frozen.files).length }); }
  for (const id of fs.readdirSync(`${root}/raw`).sort()) { const directory = `${root}/raw/${id}`; if (id === attempt) continue; const path = `${directory}/execution.json`, execution = read(path); for (const command of execution.records) { validateFile(command.stdout); validateFile(command.stderr); } const files = Object.fromEntries(fs.readdirSync(directory).sort().map(name => [`${directory}/${name}`, record(`${directory}/${name}`).sha256])); report.raw.push({ execution: record(path), records: execution.records.map(command => ({ id: command.id, exitStatus: command.exitStatus, error: command.error })), stableFiles: files }); }
  const lint=read(`${root}/attempts/lint-01/report.json`);assert.equal(lint.status,'passed');for(const command of lint.commands){assert.equal(command.exitStatus,0);validateFile(command.stdout);validateFile(command.stderr);}report.currentHarnessLint=record(`${root}/attempts/lint-01/report.json`);
  checkSource(); assert.deepEqual(immutableInputs(), report.immutable); assert.deepEqual({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }, current);
  report.source = { head: execFileSync('git', ['-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['-C', '.reference/gr8r-studio', 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(), tracked: Object.keys(sourceAssets()).length, status: execFileSync('git', ['-C', '.reference/gr8r-studio', 'status', '--porcelain'], { encoding: 'utf8' }) };
  report.counts = { qualifiedExecutedPairs: 72, archivedExecutedPairs: 66, currentExecutedPairs: 6, selectedUniqueVariants: report.visual.length, visualPairs: report.visual.length, strictComparisons: report.visual.length * 3, pngs: report.visual.length * 4, fixtureFiles: report.visual.length * 2, woffResponses: report.visual.length * 4, contextsWithFourLoadedFaces: report.visual.length * 2, nativeSelectedProbes: report.native.reduce((count, row) => count + row.probes.length, 0), httpSelectedProbes: report.http.reduce((count, row) => count + row.probes.length, 0), frozenManifests: report.freezes.length, frozenFiles: report.freezes.reduce((count, row) => count + row.files, 0), rawExecutions: report.raw.length };
  report.status = 'passed'; save(); console.log(JSON.stringify({ status: report.status, ...report.counts }));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
function implementationAssetsFrom(id) { return Object.fromEntries(Object.entries(read(`${root}/archives/${id}/manifest.json`).assets).filter(([path]) => !path.startsWith('apps/web/dist-http/') && !path.startsWith('.reference/'))); }
function httpAssetsFrom(id) { return Object.fromEntries(Object.entries(read(`${root}/archives/${id}/manifest.json`).assets).filter(([path]) => path.startsWith('apps/web/dist-http/'))); }
