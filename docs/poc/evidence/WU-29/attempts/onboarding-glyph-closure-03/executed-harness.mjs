import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { sha256 } from '../reference/source-check.mjs';

const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique glyph closure required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const record = file => { const bytes = fs.readFileSync(file); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const input = 'docs/poc/evidence/WU-29/attempts/onboarding-glyph-current-02', reportPath = `${input}/captures/report.json`, original = JSON.parse(fs.readFileSync(reportPath));
const report = { status: 'running', scope: 'Finite offline classification of all already completed frame250 Source/Target PNGs and actual measured Ready plus three summary-check SVGs. Every raw pixel remains counted. Independent Source and Target context variance, exact copy DOMRanges and SVG geometry/drawing/timing are separate observations; no target baseline, mask, arbitrary tolerance, selected best pair or historical failure relabeling.', input: record(reportPath), originalStatus: original.status, adapter: {}, cross: [], independent: [], repeat: [], observedSourceVariance: false };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const provenance = JSON.parse(fs.readFileSync(`${input}/adapter-provenance.json`)), actualAdapter = fs.readFileSync(`${input}/executed-adapter.mjs`, 'utf8');
let reconstructed = fs.readFileSync(`${input}/original-harness.mjs`, 'utf8').replace(/\b(from\s+)(['"])(\.{1,2}\/[^'"\n]+)\2/g, (whole, prefix, quote, reference) => `${prefix}${quote}${pathToFileURL(path.resolve(path.dirname(provenance.input), reference)).href}${quote}`), prefix = null;
for (let index = 0; index < provenance.changes.length; index++) { const change = provenance.changes[index]; assert.equal(reconstructed.split(change.before).length - 1, 1); reconstructed = reconstructed.replace(change.before, change.after); if (reconstructed === actualAdapter) prefix = index + 1; }
assert.notEqual(prefix, null, 'Actual executed adapter must exactly reconstruct from a declared prefix');
report.adapter = { actual: record(`${input}/executed-adapter.mjs`), claimedBytes: provenance.adapterBytes, claimedSha256: provenance.adapterSha256, appliedChangeCount: prefix, proposedButUnexecutedChanges: provenance.changes.slice(prefix), qualification: 'Original runner wrote the adapter before applying its final independent-region substitutions. Its reported adapter digest describes the later in-memory proposal, not the actual executed file. Original metadata/failure remain immutable; this closure uses exact actual adapter bytes, captured images and measured state.' }; save();
const inside = (x, y, regions) => regions.some(rect => x >= Math.floor(rect.left) && x < Math.ceil(rect.right) && y >= Math.floor(rect.top) && y < Math.ceil(rect.bottom));
const partition = (a, b, glyphs, copy) => { const x = PNG.sync.read(fs.readFileSync(a.path)), y = PNG.sync.read(fs.readFileSync(b.path)); assert.equal(x.width, y.width); assert.equal(x.height, y.height); let glyph = 0, changedCopy = 0, outside = 0; const pixels = []; for (let index = 0; index < x.width * x.height; index++) { const offset = index * 4; if (x.data.subarray(offset, offset + 4).equals(y.data.subarray(offset, offset + 4))) continue; const px = index % x.width, py = Math.floor(index / x.width); const kind = inside(px, py, copy) ? 'copy' : inside(px, py, glyphs) ? 'svg' : 'outside'; if (kind === 'copy') changedCopy++; else if (kind === 'svg') glyph++; else outside++; if (kind !== 'copy') pixels.push({ x: px, y: py, kind, source: [...x.data.subarray(offset, offset + 4)], target: [...y.data.subarray(offset, offset + 4)] }); } return { a, b, rawPixels: glyph + changedCopy + outside, glyph, changedCopy, outside, glyphRegions: glyphs, copyRegions: copy, nonCopyPixels: pixels }; };
try {
 assert.equal(original.samples.length, 12);
 for (const row of original.samples) {
  const states = row.sample.completionGlyphs; assert.equal(states.length, 2); for (const state of states) assert.equal(state.length, 4);
  for (let index = 0; index < 4; index++) { assert.deepEqual(states[0][index].rect, states[1][index].rect); assert.deepEqual(states[0][index].matrix, states[1][index].matrix); assert.deepEqual(states[0][index].drawing, states[1][index].drawing); assert.deepEqual(states[0][index].style, states[1][index].style); }
  for (let side = 0; side < 2; side++) { const result = partition(row.images[side], row.images[side + 2], states[side].map(glyph => glyph.rect), []); report.repeat.push({ id: row.sample.id, side, ...result }); save(); assert.equal(result.rawPixels, 0); }
 }
 for (const width of [1440, 390]) for (const state of ['base', 'invited']) {
  const rows = original.samples.filter(row => row.sample.width === width && row.sample.state === state); assert.equal(rows.length, 3);
  for (const a of rows) for (const b of rows) { const glyphs = [...a.sample.completionGlyphs[0], ...b.sample.completionGlyphs[1]].map(glyph => glyph.rect), copy = state === 'invited' ? [...a.declaredCopy[0], ...b.declaredCopy[1]].map(row => row.rect) : []; const result = partition(a.images[0], b.images[1], glyphs, copy); report.cross.push({ width, state, sourceContext: a.sample.cycle, targetContext: b.sample.cycle, ...result }); save(); assert.equal(result.outside, 0); }
  for (let side = 0; side < 2; side++) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const glyphs = [...rows[a].sample.completionGlyphs[side], ...rows[b].sample.completionGlyphs[side]].map(glyph => glyph.rect), result = partition(rows[a].images[side], rows[b].images[side], glyphs, []); report.independent.push({ width, state, side, contexts: [a, b], ...result }); save(); assert.equal(result.outside, 0); }
 }
 report.observedSourceVariance = report.independent.some(row => row.side === 0 && row.glyph > 0); assert.ok(report.observedSourceVariance);
 report.status = 'measured-qualified-candidate'; report.disposition = 'All raw cross differences are exact truthful-copy text or individually measured transformed SVG paint; independent original Source contexts reproduce SVG differences at this same frame. Geometry, matrices, drawing attributes and computed SVG style are exact. Raster/compositing mechanism is not asserted beyond measured context variance. Original normal-current01 and glyph-current02 stay FAILED; candidate qualification requires technical review.'; save(); console.log(JSON.stringify({ attempt, status: report.status, cross: report.cross.length, independent: report.independent.length, repeat: report.repeat.length }));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
