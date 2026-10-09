import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { newPage, environment } from '../reference/environment.mjs';
import { checkSource, sha256 } from '../reference/source-check.mjs';

const output = 'docs/poc/evidence/WU-16/diagnostics/primitive-overflow';
fs.mkdirSync(output, { recursive: true });
const clip = { x: 440, y: 100, width: 560, height: 800 };
const html = margin => `<!doctype html><html><head><style>
html,body{height:100%;margin:0}body{overflow:hidden;background:#fbfaf8}
#app{height:100vh;background:#fbfaf8}
#live{position:absolute;width:1px;height:1px;padding:0;border:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;margin:${margin}px}
#scrim{position:fixed;inset:0;background:rgba(24,22,19,.28);z-index:60}
#wrap{position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;padding:10vh 16px 16px;box-sizing:border-box;z-index:61}
#modal{width:560px;height:800px;max-height:80vh;box-sizing:border-box;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 12px 32px -8px rgba(28,25,20,.16),0 2px 6px -2px rgba(28,25,20,.06),0 0 0 1px rgb(233,231,226)}
#content{padding:24px}input{width:100%;height:34px;box-sizing:border-box;border:1px solid #e9e7e2;border-radius:6px;background:#fff;padding:7px 10px;outline:none}
svg{display:block;width:18px;height:18px;stroke:#6d6a65;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round;margin-top:20px}
</style></head><body><div id="app"></div><div id="live" aria-live="polite"></div><div id="scrim"></div><div id="wrap"><div id="modal"><div id="content"><input aria-label="Primitive control"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></div></div></div></body></html>`;

async function observeLayers(page) {
 const session = await page.context().newCDPSession(page), events = []; let layers = [];
 session.on('LayerTree.layerTreeDidChange', event => { layers = event.layers ?? []; events.push({ type: 'layers', at: performance.now(), layers }); });
 session.on('LayerTree.layerPainted', event => events.push({ type: 'painted', at: performance.now(), ...event }));
 await session.send('LayerTree.enable');
 return { events, async snapshot() {
  return Promise.all(layers.map(async layer => {
   let reasons, node;
   try { reasons = await session.send('LayerTree.compositingReasons', { layerId: layer.layerId }); } catch (error) { reasons = { error: String(error) }; }
   if (layer.backendNodeId) try { node = (await session.send('DOM.describeNode', { backendNodeId: layer.backendNodeId, depth: 0 })).node; } catch (error) { node = { error: String(error) }; }
   return { ...layer, reasons, node };
  }));
 } };
}
async function geometry(page) {
 return page.evaluate(() => {
  const box = element => ({ rect: element.getBoundingClientRect().toJSON(), logical: [element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight], css: Object.fromEntries([...getComputedStyle(element)].filter(key => !key.startsWith('--')).map(key => [key, getComputedStyle(element).getPropertyValue(key)])) });
  return { scroll: { body: document.body.scrollHeight, root: document.documentElement.scrollHeight, x: scrollX, y: scrollY }, elements: Object.fromEntries(['app', 'live', 'scrim', 'wrap', 'modal', 'content'].map(id => [id, box(document.getElementById(id))])), control: box(document.querySelector('input')), svg: box(document.querySelector('svg')), fontStatus: document.fonts.status, animationCount: document.getAnimations().length };
 });
}
function compare(left, right, name) {
 const a = PNG.sync.read(left), b = PNG.sync.read(right), diff = new PNG({ width: a.width, height: a.height });
 assert.equal(a.width, b.width); assert.equal(a.height, b.height);
 const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0, includeAA: true });
 if (changed) fs.writeFileSync(`${output}/${name}-diff.png`, PNG.sync.write(diff));
 return changed;
}
const report = { purpose: 'One isolated primitive diagnostic: only hidden live-region margin differs (0 versus -1). No Source app/template/style, product or layer mutation.', status: 'recorded', acceptance: false, runtime: { node: process.version, ...environment }, threshold: 0, includeAA: true, masks: [], clip, variants: [], limitations: ['Standalone text-free modal/input/SVG: no app, canonical queries, fonts or finite entry animation.', 'A positive toy result cannot establish causality in the actual consumer or authorize live-region/Portal/layer changes.', 'A negative result rules out only this isolated geometry and paint setup.'] };
let browser;
try {
 checkSource(); browser = await chromium.launch(); report.runtime.browser = browser.version();
 const buffers = [];
 for (const margin of [0, -1]) {
  const { context, page } = await newPage(browser), observer = await observeLayers(page), content = html(margin);
  await page.setContent(content);
  await page.evaluate(async () => { await document.fonts.ready; document.body.getBoundingClientRect(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const before = await geometry(page), layersBefore = await observer.snapshot();
  assert.equal(before.scroll.root, margin === 0 ? 1001 : 1000); assert.equal(before.scroll.y, 0);
  assert.deepEqual([before.elements.modal.rect.x, before.elements.modal.rect.y, before.elements.modal.rect.width, before.elements.modal.rect.height], Object.values(clip));
  const screenshot = () => page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  for (let warm = 0; warm < 2; warm++) await screenshot();
  const image = await screenshot(), repeat = await screenshot(), after = await geometry(page), layersAfter = await observer.snapshot();
  const name = `margin-${margin}`, path = `${output}/${name}.png`;
  fs.writeFileSync(path, image); fs.writeFileSync(`${output}/${name}-repeat.png`, repeat);
  report.variants.push({ margin, contentSha256: sha256(content), geometryBefore: before, geometryAfter: after, layersBefore, layersAfter, layerEvents: observer.events, path, sha256: sha256(image), repeatSha256: sha256(repeat), repeatabilityPixels: compare(image, repeat, `${name}-repeat`) });
  buffers.push(image); await context.close();
 }
 report.changedPixels = compare(buffers[0], buffers[1], 'margin-comparison');
 report.sameOwnedGeometry = ['modal', 'content'].every(id => JSON.stringify(report.variants[0].geometryAfter.elements[id]) === JSON.stringify(report.variants[1].geometryAfter.elements[id])) && JSON.stringify(report.variants[0].geometryAfter.control) === JSON.stringify(report.variants[1].geometryAfter.control) && JSON.stringify(report.variants[0].geometryAfter.svg) === JSON.stringify(report.variants[1].geometryAfter.svg);
 report.scriptSha256 = sha256(fs.readFileSync(new URL(import.meta.url)));
 checkSource(); console.log(JSON.stringify({ status: report.status, changedPixels: report.changedPixels, repeats: report.variants.map(variant => variant.repeatabilityPixels), sameOwnedGeometry: report.sameOwnedGeometry }));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); throw error; }
finally { fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); await browser?.close(); }
