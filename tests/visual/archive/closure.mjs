import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sha256, readJson, checkSource } from '../reference/source-check.mjs';
import { implementationAssets, httpBuildAssets, sourceAssets, immutableInputs } from '../settings/assets.mjs';
const root = 'docs/poc/evidence/WU-28', attempt = process.argv[2], output = `${root}/attempts/${attempt}`;
assert.ok(attempt && !fs.existsSync(output)); fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const record = file => { const bytes = fs.readFileSync(file); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const validate = row => assert.deepEqual(record(row.path), row);
const current = { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }, immutable = immutableInputs();
const report = { status: 'running', current, immutable, selected: [], references: {}, raw: [], archives: [], freezes: [], scope: 'WU28 bounded actual current32 static43 pairs and affected native N20. Archived27 individual native21; archived31 native8/HTTP5/motion24/computed16 with unchanged handler/timer/error bytes and one catalog-name overflow bridge. All failed originals and inherited missing-byte/default/Darwin/WU29 debts remain unaccepted. No self-freeze, source edits, masks, tolerance, snapshots or new capabilities.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
function references(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && Number.isInteger(value.bytes) && /^[a-f0-9]{64}$/.test(value.sha256 ?? '')) { validate({ path: value.path, bytes: value.bytes, sha256: value.sha256 }); report.references[value.path] = record(value.path); }
  for (const child of Object.values(value)) references(child);
}
function matchingMap(map, archive) { assert.ok(map); for (const [file, hash] of Object.entries(map)) assert.equal(archive[file], hash, file); }
function selected(id, archive, expectedStatus) {
  const file = `${root}/attempts/${id}/report.json`, result = readJson(file);
  assert.equal(result.status, expectedStatus); matchingMap(result.assetsBefore, archive); if (result.assetsAfter) assert.deepEqual(result.assetsAfter, result.assetsBefore);
  assert.deepEqual(result.immutableBefore, immutable); if (result.immutableAfter) assert.deepEqual(result.immutableAfter, immutable);
  references(result); report.selected.push({ id, report: record(file), reportStatus: result.status, assetsBeforeCount: Object.keys(result.assetsBefore).length, assetsAfterExists: !!result.assetsAfter }); return result;
}
function pixel(a, b) { const x = PNG.sync.read(fs.readFileSync(a.path)), y = PNG.sync.read(fs.readFileSync(b.path)); assert.equal(x.width, y.width); assert.equal(x.height, y.height); let rgba = 0; for (let i = 0; i < x.data.length; i += 4) if ([0, 1, 2, 3].some(c => x.data[i + c] !== y.data[i + c])) rgba++; const exact = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0, includeAA: true }); assert.equal(exact, rgba); return { pixels: exact, x, y }; }
try {
  assert.deepEqual(readJson(`${root}/archives/final-01/manifest.json`).files, current);
  const archive27 = readJson(`${root}/archives/core-27-before-static-samples-fix/manifest.json`).files, archive31 = readJson(`${root}/archives/core31-before-workspace-overflow/manifest.json`).files;
  const bridge = [...new Set([...Object.keys(current), ...Object.keys(archive31)])].filter(file => current[file] !== archive31[file]);
  assert.deepEqual(bridge.filter(file => !file.startsWith('apps/web/dist')), ['apps/web/src/app/shell/Sidebar.tsx']); report.archive31Bridge = bridge;
  const n11 = selected('native-11', archive27, 'failed'), n12 = selected('native-12', archive27, 'failed'), n14 = selected('native-14', archive27, 'passed');
  assert.ok(!n11.assetsAfter && !n12.assetsAfter); const native = [...n11.journeys.filter(row => row.status === 'passed'), ...n12.journeys.filter(row => row.status === 'passed'), ...n14.journeys]; assert.equal(native.length, 21); assert.ok(native.every(row => row.status === 'passed')); report.archivedNativeSelection = native.map(row => row.id);
  const n15 = selected('native-15', archive31, 'passed'), n16 = selected('native-16', current, 'passed'); assert.equal(n15.journeys.length, 8); assert.equal(n16.journeys.length, 1); assert.ok([...n15.journeys, ...n16.journeys].every(row => row.status === 'passed'));
  const http = selected('http-03', archive31, 'passed'), motion = selected('motion-01', archive31, 'passed'), menu = selected('menu-style-03', archive31, 'passed');
  assert.equal(http.probes.length, 5); assert.equal(http.requests.length, 73); assert.ok(http.probes.every(row => row.status === 'passed')); assert.equal(motion.probes.length, 24); assert.equal(menu.samples.length, 16);
  const visual = selected('visual-13', current, 'passed-bounded'); assert.equal(visual.samples.length, 22); let pairs = 0, whole = 0, copy = 0, fonts = 0;
  for (const sample of visual.samples) {
    for (const side of sample.responses) { assert.equal(side.length, 2); fonts += side.length; for (const response of side) assert.equal(response.status, 200); }
    for (const capture of sample.captures) {
      pairs++; const actual = pixel(capture.source, capture.target); assert.equal(actual.pixels, capture.changed.pixels); assert.equal(pixel(capture.source, capture.sourceRepeat).pixels, 0); assert.equal(pixel(capture.target, capture.targetRepeat).pixels, 0);
      if (!actual.pixels) whole++; else {
        copy++; assert.equal(capture.copyQualification.outsidePixels, 0); let outside = 0;
        for (let i = 0; i < actual.x.width * actual.x.height; i++) if ([0, 1, 2, 3].some(c => actual.x.data[i * 4 + c] !== actual.y.data[i * 4 + c])) { const px = i % actual.x.width, py = Math.floor(i / actual.x.width); if (!capture.copyQualification.bounds.some(r => px >= r.left && px < r.right && py >= r.top && py < r.bottom)) outside++; }
        assert.equal(outside, 0);
      }
    }
  }
  assert.deepEqual([pairs, whole, copy, fonts], [43, 31, 12, 88]); selected('menu-layer-02', current, 'diagnosis-complete');
  const gates = readJson(`${root}/attempts/core-32/report.json`); assert.equal(gates.status, 'passed'); assert.equal(gates.commands.length, 7); for (const command of gates.commands) { assert.equal(command.exitStatus, 0); validate(command.stdout); validate(command.stderr); } report.gates = record(`${root}/attempts/core-32/report.json`);
  for (const id of fs.readdirSync(`${root}/attempts`).sort()) { if (id === attempt) continue; const file = `${root}/attempts/${id}/report.json`; if (fs.existsSync(file)) references(readJson(file)); }
  references(readJson(`${root}/action-assignments.json`));
  for (const id of fs.readdirSync(`${root}/raw`).sort()) {
    if (id === attempt) continue; const file = `${root}/raw/${id}/execution.json`; assert.ok(fs.existsSync(file), file); const execution = readJson(file); for (const row of [execution.command, execution.stdout, execution.stderr]) validate(row);
    const expected = execution.argv.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ') + '\n'; assert.equal(fs.readFileSync(execution.command.path, 'utf8'), expected);
    const outer = fs.readdirSync(path.dirname(file)).filter(name => name.startsWith('outer')).map(name => record(`${path.dirname(file)}/${name}`));
    report.raw.push({ execution: record(file), exitStatus: execution.exitStatus, outer, qualification: /core-(0[1-9]|1[0-9]|20|22)$|archive-core18|archive-core19|archive-core20|prerequisite/.test(id) ? 'Original outer receipt qualification remains as recorded in PROGRESS. Manually transcribed/missing-original receipts are not recovered by this validation. Child bytes are independently exact.' : 'Outer files retain their existing bytes. Direct selected current tool objects and historical manual/missing-original qualifications are described in PROGRESS; filename/presence alone does not establish original receipt authenticity.' });
  }
  for (const name of fs.readdirSync(`${root}/archives`).sort()) {
    const file = `${root}/archives/${name}/manifest.json`, manifest = readJson(file); let bytes = 0;
    for (const [source, hash] of Object.entries(manifest.files)) { const row = record(`${root}/archives/${name}/${source}`); assert.equal(row.sha256, hash); bytes += row.bytes; }
    assert.deepEqual(manifest.immutableInputs, immutable); report.archives.push({ name, manifest: record(file), files: Object.keys(manifest.files).length, bytes });
  }
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('-freeze.json'))) { const file = `${root}/${name}`, freeze = readJson(file); for (const [source, hash] of Object.entries(freeze.files)) assert.equal(record(source).sha256, hash); report.freezes.push({ manifest: record(file), count: freeze.count }); }
  checkSource(); assert.deepEqual(current, { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }); report.counts = { pairs, whole, copy, repeats: pairs * 2, fonts, archivedNative: 21, archivedAffectedNative: 8, currentAffectedNative: 1, HTTP: 5, HTTPRequests: 73, motion: 24, computed: 16, archives: report.archives.length, archiveFiles: report.archives.reduce((n, row) => n + row.files, 0), archiveBytes: report.archives.reduce((n, row) => n + row.bytes, 0), raw: report.raw.length, uniqueReferences: Object.keys(report.references).length, referencedBytes: Object.values(report.references).reduce((n, row) => n + row.bytes, 0) }; report.status = 'passed-bounded'; save(); console.log(JSON.stringify({ status: report.status, ...report.counts }));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
