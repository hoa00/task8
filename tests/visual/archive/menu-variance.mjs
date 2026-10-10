import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, readJson, sha256 } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { implementationAssets, httpBuildAssets, sourceAssets, immutableInputs } from '../settings/assets.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-28/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique independent diagnostic required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', assetsBefore: assets(), immutableBefore: immutableInputs(), runtime: { node: process.version, ...environment }, scope: 'Predetermined THREE fresh independent contexts per side, native first workspace menu, BOTH OS reduce/locked infinite-animation phase0, all fifteen cross/within comparisons and six repeats. Diagnostic only; visual12 desktop55 remains FAILED_UNACCEPTED, no best-pair/strict-pass/whole-project/default/Darwin claim.', contexts: [], comparisons: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const json = (name, value) => store(name, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
function compare(a, b, name) { const x = PNG.sync.read(fs.readFileSync(a.path)), y = PNG.sync.read(fs.readFileSync(b.path)), diff = new PNG({ width: x.width, height: x.height }); const pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true }); let left = x.width, top = x.height, right = -1, bottom = -1; const rgba = [];
  for (let i = 0; i < x.width * x.height; i++) if (x.data.subarray(i * 4, i * 4 + 4).some((value, channel) => value !== y.data[i * 4 + channel])) { const px = i % x.width, py = Math.floor(i / x.width); left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px); bottom = Math.max(bottom, py); rgba.push({ x: px, y: py, a: [...x.data.subarray(i * 4, i * 4 + 4)], b: [...y.data.subarray(i * 4, i * 4 + 4)] }); }
  return { name, pixels, bounds: right < 0 ? null : { left, top, right, bottom }, image: store(`${name}-diff.png`, PNG.sync.write(diff)), rgba: json(`${name}-rgba.json`, rgba) };
}
let browser; const sourceStop = await sourceServer(), targetStop = await targetServer();
try {
  checkSource(); browser = await chromium.launch({ args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  for (const side of ['source', 'target']) for (let index = 0; index < 3; index++) {
    const original = readJson(`${artifacts}/source-fixture.json`), session = await newPage(browser, { viewport: { width: 1440, height: 1000 } }, side === 'source' ? original : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173'), page = session.page, fonts = [], pending = [];
    page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); fonts.push({ status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(side === 'source' ? 'http://127.0.0.1:4173/#states' : 'http://127.0.0.1:5173/dev/system-states'); await page.waitForSelector(side === 'source' ? '.states-grid' : '[data-system-states]'); await ready(page);
    const before = json(`${side}-${index}-before.json`, await page.evaluate(() => ({ url: location.href, storage: Object.fromEntries(Object.entries(localStorage)), html: document.documentElement.outerHTML })));
    if (side === 'source') await page.locator('[data-pop=ws]').click(); else await page.getByRole('button', { name: 'Switch workspace', exact: true }).click(); await page.waitForSelector(side === 'source' ? '.pop.floating' : '[role=menu]'); await ready(page); await Promise.all(pending);
    await page.evaluate(() => { for (const animation of document.getAnimations()) if (animation.effect?.getTiming().iterations === Infinity) { animation.pause(); animation.currentTime = 0; } document.activeElement?.blur(); }); await page.mouse.move(1439, 999);
    const data = await page.evaluate(side => {
      const popup = document.querySelector(side === 'source' ? '.pop.floating' : '[role=menu]'), all = [popup, ...popup.querySelectorAll('button,svg,svg *,span')];
      return { html: document.documentElement.outerHTML, faces: [...document.fonts].filter(face => /Geist/.test(face.family)).map(face => ({ family: face.family.replaceAll('"', ''), weight: face.weight, status: face.status })), animations: document.getAnimations().map(animation => ({ name: animation.animationName, currentTime: animation.currentTime, playState: animation.playState, timing: animation.effect?.getTiming(), keyframes: animation.effect?.getKeyframes() })), elements: all.map(el => ({ html: el.outerHTML, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(el)].map(key => [key, getComputedStyle(el).getPropertyValue(key)])), parents: [...function* () { for (let p = el.parentElement, n = 0; p && n < 5; p = p.parentElement, n++) yield { html: p.outerHTML.slice(0, 200), rect: p.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(p)].map(key => [key, getComputedStyle(p).getPropertyValue(key)])) }; }()] })) };
    }, side);
    const row = { side, index, original: json(`${side}-${index}-source-original.json`, original), before, fonts, diagnostic: json(`${side}-${index}-computed.json`, data), image: store(`${side}-${index}.png`, await page.screenshot({ animations: 'allow' })), repeat: store(`${side}-${index}-repeat.png`, await page.screenshot({ animations: 'allow' })) }; report.contexts.push(row); save();
    assert.equal(fonts.length, 2); for (const font of fonts) assert.ok([{ bytes: 29288, sha256: '9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608' }, { bytes: 9872, sha256: '23840067d1dda8749b421a47c3e56205fa78c0d58d40baf3cc4d625fbe667f36' }].some(expected => font.status === 200 && font.bytes === expected.bytes && font.sha256 === expected.sha256)); assert.deepEqual(data.faces.filter(face => face.status === 'loaded').map(face => `${face.family}:${face.weight}`).sort(), ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400'].sort());
    row.repeatComparison = compare(row.image, row.repeat, `${side}-${index}-repeat`); assert.equal(row.repeatComparison.pixels, 0); await session.context.close();
  }
  for (let a = 0; a < report.contexts.length; a++) for (let b = a + 1; b < report.contexts.length; b++) { const x = report.contexts[a], y = report.contexts[b]; report.comparisons.push({ sides: [x.side, y.side], contexts: [x.index, y.index], ...compare(x.image, y.image, `${x.side}-${x.index}-${y.side}-${y.index}`) }); }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource(); report.status = 'diagnosis-complete'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await sourceStop(); await targetStop(); }
