import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { sha256 } from '../reference/source-check.mjs';

const evidence = path.resolve('docs/poc/evidence/WU-08');
const output = path.resolve('test-results/WU-08');
const accepted = path.join(evidence, 'linux-samples');
const review = path.join(evidence, 'review');
fs.mkdirSync(accepted, { recursive: true });
fs.mkdirSync(review, { recursive: true });
const report = JSON.parse(fs.readFileSync(`${evidence}/visual-verification.json`, 'utf8'));
assert.equal(report.status, 'passed');
for (const sample of report.samples) for (const side of ['source', 'target']) {
  const bytes = fs.readFileSync(`${output}/${sample.id}-${side}.png`);
  assert.equal(sha256(bytes), sample[`${side}Sha256`]);
  fs.writeFileSync(`${accepted}/${sample.id}-${side}.png`, bytes);
}
const groups = [];
for (const theme of ['light', 'dark']) {
  const samples = report.samples.filter(sample => sample.id.endsWith(`${theme}-1000`));
  groups.push([`${theme}-a`, samples.slice(0, 4)], [`${theme}-b`, samples.slice(4)]);
}
groups.push(['mobile', report.samples.filter(sample => sample.id.endsWith('-390'))]);
groups.push(['boundary', report.samples.filter(sample => /-(639|640|641)$/.test(sample.id))]);
const sheets = groups.map(([name, samples]) => {
  const images = samples.map(sample => PNG.sync.read(fs.readFileSync(`${accepted}/${sample.id}-source.png`)));
  const canvas = new PNG({ width: Math.max(...images.map(png => png.width)), height: images.reduce((sum, png) => sum + png.height + 12, 0) });
  canvas.data.fill(255);
  let y = 0;
  for (const png of images) { PNG.bitblt(png, canvas, 0, 0, png.width, png.height, 0, y); y += png.height + 12; }
  const filename = `source-${name}-sheet.png`;
  fs.writeFileSync(`${review}/${filename}`, PNG.sync.write(canvas));
  return { path: `docs/poc/evidence/WU-08/review/${filename}`, ids: samples.map(sample => sample.id), composition: 'Source-only original PNG bytes placed without scaling, labels, masking or image content changes.' };
});
fs.writeFileSync(`${review}/sheets.json`, JSON.stringify({ sourceSha: report.sourceSha, samples: report.samples.length, acceptedPngCount: report.samples.length * 2, sheets }, null, 2) + '\n');
console.log(JSON.stringify({ samples: report.samples.length, copiedPngCount: report.samples.length * 2, sheets: sheets.length }));
