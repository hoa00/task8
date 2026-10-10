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
const osReduce = process.argv.includes('--os-reduce'), phaseZero = process.argv.includes('--phase0');
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
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); report.runtime.reducedMotion = osReduce ? 'reduce' : 'no-preference'; if (phaseZero) report.scope += ' Separate CAPTURE.md infinite-animation phase0 cohort; BOTH pause currentTime0 after finite readiness, screenshots animations:allow, raw repeats retained.'; if (osReduce) report.scope += ' Qualified BOTH OS prefers-reduced-motion=reduce from before first navigation; separate from normal defaults.';
  for (const width of [1440, 390]) for (const view of ['archive-empty', 'archive-tasks', 'archive-projects', 'system', 'states', 'full-denied', 'full-not-found', 'menu-help', 'menu-workspace', 'menu-profile', 'menu-create']) {
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
    await a.page.goto(`http://127.0.0.1:4173/#${view.startsWith('archive') ? 'archive' : view.startsWith('full-')?'states':view.startsWith('menu-')?'states':view}`);
    await b.page.goto(`http://127.0.0.1:5173/${view === 'system' ? 'dev/design-system' : view === 'states' || view.startsWith('menu-') ? 'dev/system-states' : view==='full-denied'?`w/${workspaceId}/projects/${sourceId('projects','p6')}/board`:view==='full-not-found'?`w/${workspaceId}/nowhere`:`w/${workspaceId}/archive`}`);
    if (view.startsWith('menu-')) {
      for (const session of [a, b]) { await session.page.waitForSelector(session === a ? '.states-grid' : '[data-system-states]'); await ready(session.page); }
      if (width === 390 && view !== 'menu-create') for (const session of [a, b]) await session.page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const sourceType = { 'menu-help': 'help', 'menu-workspace': 'ws', 'menu-profile': 'user', 'menu-create': 'create' }[view];
      await a.page.locator(`[data-pop="${sourceType}"]`).first().click();
      await b.page.getByRole('button', { name: { 'menu-help': 'Help & resources', 'menu-workspace': 'Switch workspace', 'menu-profile': 'Profile', 'menu-create': 'Create new' }[view], exact: true }).click();
      await a.page.waitForSelector('.pop.floating'); await b.page.waitForSelector('[role=menu]');
    }
    if (view === 'full-denied') { if (width === 390) await a.page.getByRole('button', { name: 'Open navigation', exact: true }).click(); await a.page.locator('.side [data-r=project][data-id=p6]').first().click(); } else if (view === 'full-not-found') await a.page.getByRole('button', { name: 'Open example', exact: true }).nth(1).click();
    await a.page.waitForSelector(view.startsWith('full-')?'.fullstate':'.page'); await b.page.waitForSelector(view === 'system' ? '[data-design-system]' : view === 'states' || view.startsWith('menu-') ? '[data-system-states]' : view.startsWith('full-')?'[data-fullstate]':'[data-archive-page]');
    if (view === 'archive-projects') for (const page of [a.page, b.page]) await page.getByRole('tab', { name: /^Projects/ }).click();
    for (const page of [a.page, b.page]) { await ready(page); await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(width - 1, height - 1); }
    await Promise.all(pending);
    const fontDescriptors = await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => /Geist/.test(face.family)).map(face => ({ family: face.family.replaceAll('"', ''), weight: face.weight, status: face.status })))));
    report.activeFonts = { id, responses, fontDescriptors }; save();
    const loaded = fontDescriptors.map(faces => faces.filter(face => face.status === 'loaded'));
    for (const fonts of responses) { assert.equal(fonts.length, 2); for (const font of fonts) { assert.equal(font.status, 200); assert.ok([{ bytes: 29288, sha256: '9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608' }, { bytes: 9872, sha256: '23840067d1dda8749b421a47c3e56205fa78c0d58d40baf3cc4d625fbe667f36' }].some(row => row.bytes === font.bytes && row.sha256 === font.sha256)); } }
    for (const fonts of loaded) assert.deepEqual(fonts.map(face => `${face.family}:${face.weight}:${face.status}`).sort(), ['Geist:400:loaded', 'Geist:500:loaded', 'Geist:600:loaded', 'Geist Mono:400:loaded'].sort());
    const pages = [a.page, b.page], geometry = await Promise.all(pages.map(page => page.evaluate(() => ({ scroll: [...document.querySelectorAll('main,.content,#main-content')].map(el => ({ tag: el.tagName, id: el.id, top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight })), h1: [...document.querySelectorAll('h1')].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })), sections: [...document.querySelectorAll('h2,h3')].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })), computed:[...document.querySelectorAll('.fullstate .box,[data-fullstate]>div,.fullstate svg,[data-fullstate] svg,.fullstate button,[data-fullstate] button,.fullstate p,[data-fullstate] p,.fullstate h1,[data-fullstate] h1,.pop.floating,[role=menu],.side,[data-gallery-sidebar],.sk,.ui-skeleton')].slice(0,80).map(el=>{const css=getComputedStyle(el);return {tag:el.tagName,class:el.className.baseVal??el.className,rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(['position','transform','translate','overflow','display','flexDirection','boxShadow','backgroundColor','borderColor','fontSize','lineHeight','padding','margin','gap','minHeight','height','width','borderRadius','borderTopWidth','borderTopColor','borderTopStyle','color','fontWeight','letterSpacing','opacity','animationName','animationFillMode'].map(key=>[key,css[key]]))};}),html: document.documentElement.outerHTML }))));
    const maximum = Math.max(...geometry.flatMap(row => row.scroll.filter(el => el.id === 'main-content').map(el => el.height - el.client))); const positions = view === 'system' || view === 'states' ? [...new Set([0, ...Array.from({ length: Math.ceil(maximum / 600) }, (_, index) => Math.min((index + 1) * 600, maximum))])] : [0];
    const captures = [];
    for (const top of positions) {
      for (const page of pages) await page.evaluate(top => { const el = document.querySelector('#main-content'); if (el) el.scrollTop = top; window.scrollTo(0, top); }, top);
      await Promise.all(pages.map(ready));
      const animations=await Promise.all(pages.map(page=>page.evaluate(phaseZero=>document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations===Infinity).map(animation=>{if(phaseZero){animation.pause();animation.currentTime=0;}return {name:animation.animationName??null,phase:animation.currentTime,playState:animation.playState,timing:animation.effect?.getTiming()};}),phaseZero)));
      const source = await a.page.screenshot({animations:'allow'}), sourceRepeat = await a.page.screenshot({animations:'allow'}), target = await b.page.screenshot({animations:'allow'}), targetRepeat = await b.page.screenshot({animations:'allow'});
      const name = `${id}-scroll${top}`;
      const actualScroll = await Promise.all(pages.map(page => page.locator('#main-content').evaluate(el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))));
      const copyRegions = await Promise.all(pages.map((page, side) => page.evaluate(({ view, side }) => {
        const selector = view.startsWith('archive') ? (side === 0 ? '.ph p' : '[data-archive-page] p') : view === 'full-denied' ? (side === 0 ? '.fullstate p' : '[data-fullstate] p') : view === 'states' ? 'p' : null;
        const candidates = selector ? [...document.querySelectorAll(selector)] : [];
        const el = view === 'states' ? candidates.find(el => el.textContent.startsWith('Check your connection.')) : candidates[0];
        if (!el) return [];
        const range = document.createRange(); range.selectNodeContents(el);
        return [{ text: el.textContent, selector, element: el.getBoundingClientRect().toJSON(), textRects: [...range.getClientRects()].map(rect => rect.toJSON()) }];
      }, { view, side })));
      let copyQualification = null;
      if (copyRegions.every(regions => regions.length)) {
        const x = PNG.sync.read(source), y = PNG.sync.read(target), fullDiff = new PNG({ width: x.width, height: x.height });
        pixelmatch(x.data, y.data, fullDiff.data, x.width, x.height, { threshold: 0, includeAA: true });
        const bounds = copyRegions.flatMap(regions => regions.flatMap(region => region.textRects)).map(rect => ({ left: Math.floor(rect.left), top: Math.floor(rect.top), right: Math.ceil(rect.right), bottom: Math.ceil(rect.bottom) }));
        let outsidePixels = 0, insidePixels = 0;
        for (let row = 0; row < x.height; row++) for (let col = 0; col < x.width; col++) { const i = (row * x.width + col) * 4; if (fullDiff.data[i] === 255 && fullDiff.data[i + 1] === 0 && fullDiff.data[i + 2] === 0) { if (bounds.some(rect => col >= rect.left && col < rect.right && row >= rect.top && row < rect.bottom)) insidePixels++; else outsidePixels++; } }
        copyQualification = { classification: 'INTENTIONAL_TRUTHFUL_COPY_RAW_FULL_RETAINED', regions: copyRegions, bounds, insidePixels, outsidePixels, masks: [], threshold: 0, note: 'Accounting only on unchanged full PNG bytes and actual text range bounds; outside must be zero for bounded acceptance. Whole-page nonzero remains nonzero.' };
      }
      captures.push({ top, actualScroll, animations, copyQualification, source: store(`${name}-source.png`, source), sourceRepeat: store(`${name}-source-repeat.png`, sourceRepeat), target: store(`${name}-target.png`, target), targetRepeat: store(`${name}-target-repeat.png`, targetRepeat), changed: compare(source, target, name), repeats: [compare(source, sourceRepeat, `${name}-source-repeat`), compare(target, targetRepeat, `${name}-target-repeat`)] });
    }
    report.samples.push({ id, fixtures, responses, fontDescriptors, loaded, geometry: store(`${id}-geometry.json`, Buffer.from(JSON.stringify(geometry, null, 2) + '\n')), captures }); save(); console.log(`${id}: ${captures.map(row => row.changed.pixels).join(',')}`); await a.context.close(); await b.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource(); report.fullPixelParity = report.samples.every(sample => sample.captures.every(row => row.changed.pixels === 0)); report.status = report.samples.some(sample => sample.captures.some(row => row.repeats.some(value => value.pixels) || (row.changed.pixels && row.copyQualification?.outsidePixels !== 0))) ? 'failed' : report.fullPixelParity ? 'passed' : 'passed-bounded'; save(); assert.notEqual(report.status, 'failed');
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await stopTarget(); await stopSource(); }
