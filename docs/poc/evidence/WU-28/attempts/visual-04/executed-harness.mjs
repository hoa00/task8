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
import { createSeedDataset, seedProvenance } from '../../../apps/web/src/data/mock/seed.ts';
import { mockStorageKey } from '../../../apps/web/src/data/mock/persistence.ts';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
const osReduce = process.argv.includes('--os-reduce');
const attempt = process.argv[2], output = `docs/poc/evidence/WU-28/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', assetsBefore: assets(), immutableBefore: immutableInputs(), runtime: { node: process.version, os: 'linux', ...environment }, samples: [], threshold: 0, includeAA: true, masks: [], scope: 'Natural first lifecycle and repeated full viewport/scroll PNGs; both disable-partial-raster; no Source edits, rebaseline, tolerance or masks. Intentional truthful copy differences retain raw images and do not establish whole parity.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
function compare(a, b, name) { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const diff = new PNG({ width: x.width, height: x.height }), pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true }); return { pixels, image: store(`${name}-diff.png`, PNG.sync.write(diff)) }; }
const workspaceId = sourceId('workspaces', 'w1');
let browser; const stopSource = await sourceServer(), stopTarget = await targetServer();
try {
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); report.runtime.reducedMotion = osReduce ? 'reduce' : 'no-preference'; if (osReduce) report.scope += ' Qualified BOTH OS prefers-reduced-motion=reduce from before first navigation; separate from normal defaults.';
  for (const width of [1440, 390]) for (const view of ['archive-empty', 'archive-tasks', 'archive-projects', 'system', 'states']) {
    const id = `${view}-${width}`, height = width === 1440 ? 1000 : 844, original = readJson(`${artifacts}/source-fixture.json`), fixture = structuredClone(original), dataset = createSeedDataset();
    fixture.prefs.theme = 'light';
    if (view === 'archive-tasks') { fixture.data.tasks.find(row => row.id === 't3').archived = true; fixture.data.tasks.find(row => row.id === 't3').archivedAt = Date.parse(environment.clock); dataset.tasks[sourceId('tasks', 't3')].archivedAt = environment.clock; }
    if (view === 'archive-projects') { fixture.data.projects.find(row => row.id === 'p5').archived = true; fixture.data.projects.find(row => row.id === 'p5').archivedAt = Date.parse(environment.clock); dataset.projects[sourceId('projects', 'p5')].archivedAt = environment.clock; }
    const fixtures = { original: store(`${id}-source-original.json`, Buffer.from(JSON.stringify(original, null, 2) + '\n')), source: store(`${id}-source-before.json`, Buffer.from(JSON.stringify(fixture, null, 2) + '\n')), target: store(`${id}-target-before.json`, Buffer.from(JSON.stringify(dataset, null, 2) + '\n')) };
    const a = await newPage(browser, { viewport: { width, height }, mobile: width === 390 }, fixture), b = await newPage(browser, { viewport: { width, height }, mobile: width === 390 }, undefined, true, 'http://127.0.0.1:5173');
    await b.context.addInitScript(({ dataset, key, fixtureSha256 }) => { localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })); localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme: 'light', accent: 'indigo', motion: 'system' })); }, { dataset, key: mockStorageKey(workspaceId), fixtureSha256: seedProvenance.fixtureSha256 });
    for (const page of [a.page, b.page]) await page.emulateMedia({ reducedMotion: osReduce ? 'reduce' : 'no-preference' });
    const responses = [[], []], pending = [];
    for (const [session, side] of [[a, 0], [b, 1]]) session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); responses[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
    await a.page.goto(`http://127.0.0.1:4173/#${view.startsWith('archive') ? 'archive' : view}`);
    await b.page.goto(`http://127.0.0.1:5173/${view === 'system' ? 'dev/design-system' : view === 'states' ? 'dev/system-states' : `w/${workspaceId}/archive`}`);
    await a.page.waitForSelector('.page'); await b.page.waitForSelector(view === 'system' ? '[data-design-system]' : view === 'states' ? '[data-system-states]' : '[data-archive-page]');
    if (view === 'archive-projects') for (const page of [a.page, b.page]) await page.getByRole('tab', { name: /^Projects/ }).click();
    for (const page of [a.page, b.page]) { await ready(page); await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(width - 1, height - 1); }
    await Promise.all(pending);
    const fontDescriptors = await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => /Geist/.test(face.family)).map(face => ({ family: face.family.replaceAll('"', ''), weight: face.weight, status: face.status })))));
    report.activeFonts = { id, responses, fontDescriptors }; save();
    const loaded = fontDescriptors.map(faces => faces.filter(face => face.status === 'loaded'));
    for (const fonts of responses) { assert.equal(fonts.length, 2); for (const font of fonts) { assert.equal(font.status, 200); assert.ok([{ bytes: 29288, sha256: '9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608' }, { bytes: 9872, sha256: '23840067d1dda8749b421a47c3e56205fa78c0d58d40baf3cc4d625fbe667f36' }].some(row => row.bytes === font.bytes && row.sha256 === font.sha256)); } }
    for (const fonts of loaded) assert.deepEqual(fonts.map(face => `${face.family}:${face.weight}:${face.status}`).sort(), ['Geist:400:loaded', 'Geist:500:loaded', 'Geist:600:loaded', 'Geist Mono:400:loaded'].sort());
    const pages = [a.page, b.page], geometry = await Promise.all(pages.map(page => page.evaluate(() => ({ scroll: [...document.querySelectorAll('main,.content,#main-content')].map(el => ({ tag: el.tagName, id: el.id, top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight })), h1: [...document.querySelectorAll('h1')].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })), sections: [...document.querySelectorAll('h2,h3')].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })), html: document.documentElement.outerHTML }))));
    const maximum = Math.max(...geometry.flatMap(row => row.scroll.filter(el => el.id === 'main-content').map(el => el.height - el.client))); const positions = view === 'system' || view === 'states' ? [...new Set([0, ...Array.from({ length: Math.ceil(maximum / 600) }, (_, index) => Math.min((index + 1) * 600, maximum))])] : [0];
    const captures = [];
    for (const top of positions) {
      for (const page of pages) await page.evaluate(top => { const el = document.querySelector('#main-content'); if (el) el.scrollTop = top; window.scrollTo(0, top); }, top);
      await Promise.all(pages.map(ready));
      const source = await a.page.screenshot(), sourceRepeat = await a.page.screenshot(), target = await b.page.screenshot(), targetRepeat = await b.page.screenshot();
      const name = `${id}-scroll${top}`;
      const actualScroll = await Promise.all(pages.map(page => page.locator('#main-content').evaluate(el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))));
      captures.push({ top, actualScroll, source: store(`${name}-source.png`, source), sourceRepeat: store(`${name}-source-repeat.png`, sourceRepeat), target: store(`${name}-target.png`, target), targetRepeat: store(`${name}-target-repeat.png`, targetRepeat), changed: compare(source, target, name), repeats: [compare(source, sourceRepeat, `${name}-source-repeat`), compare(target, targetRepeat, `${name}-target-repeat`)] });
    }
    report.samples.push({ id, fixtures, responses, fontDescriptors, loaded, geometry: store(`${id}-geometry.json`, Buffer.from(JSON.stringify(geometry, null, 2) + '\n')), captures }); save(); console.log(`${id}: ${captures.map(row => row.changed.pixels).join(',')}`); await a.context.close(); await b.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource(); report.status = report.samples.some(sample => sample.captures.some(row => row.changed.pixels || row.repeats.some(value => value.pixels))) ? 'failed' : 'passed'; save(); assert.equal(report.status, 'passed');
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await stopTarget(); await stopSource(); }
