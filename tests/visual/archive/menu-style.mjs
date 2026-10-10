import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, readJson, sha256 } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { createSeedDataset, seedProvenance } from '../../../apps/web/src/data/mock/seed.ts';
import { mockStorageKey } from '../../../apps/web/src/data/mock/persistence.ts';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { implementationAssets, httpBuildAssets, sourceAssets, immutableInputs } from '../settings/assets.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-28/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique diagnostic required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const verify = process.argv.includes('--verify');
const report = { status: 'running', assetsBefore: assets(), immutableBefore: immutableInputs(), runtime: { node: process.version, ...environment }, qualification: 'Actual native workspace-menu/full404 first lifecycle; four motion modes with computed animation timing/keyframes/phase; finite settled styles only, no elapsed entry-duration or visual acceptance claim.', samples: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const store = (name, value) => { const path = `${output}/${name}`, bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
let browser; const sourceStop = await sourceServer(), targetStop = await targetServer();
try {
  browser = await chromium.launch({ args: ['--disable-partial-raster'] });
  for (const view of verify ? ['workspace', 'full404'] : ['workspace']) for (const mode of ['normal', 'stored-reduce', 'os-reduce', 'os-reduce-stored-full']) for (const side of ['source', 'target']) {
    const original = readJson(`${artifacts}/source-fixture.json`), fixture = structuredClone(original), dataset = createSeedDataset();
    const preference = mode === 'stored-reduce' ? 'reduce' : mode.endsWith('stored-full') ? 'full' : 'system';
    fixture.prefs.motion = preference; dataset.preferences.motion = preference;
    const session = await newPage(browser, {}, side === 'source' ? fixture : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173'), page = session.page;
    if (side === 'target') await session.context.addInitScript(({ dataset, key, fixtureSha256 }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })), { dataset, key: mockStorageKey(sourceId('workspaces', 'w1')), fixtureSha256: seedProvenance.fixtureSha256 });
    const fonts = [], pendingFonts = []; page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pendingFonts.push((async () => { const bytes = await response.body(); fonts.push({ status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
    await page.emulateMedia({ reducedMotion: mode.startsWith('os-reduce') ? 'reduce' : 'no-preference' });
    await page.goto(side === 'source' ? 'http://127.0.0.1:4173/#states' : view === 'workspace' ? 'http://127.0.0.1:5173/dev/system-states' : `http://127.0.0.1:5173/w/${sourceId('workspaces', 'w1')}/nowhere`);
    await page.waitForSelector(side === 'source' ? '.states-grid' : view === 'workspace' ? '[data-system-states]' : '[data-fullstate]'); await ready(page);
    if (view === 'workspace') { if (side === 'source') await page.locator('[data-pop=ws]').click(); else await page.getByRole('button', { name: 'Switch workspace', exact: true }).click(); }
    else if (side === 'source') await page.getByRole('button', { name: 'Open example', exact: true }).nth(1).click();
    await page.waitForSelector(side === 'source' ? view === 'workspace' ? '.pop.floating' : '.fullstate' : view === 'workspace' ? '[role=menu]' : '[data-fullstate]'); await ready(page); await Promise.all(pendingFonts);
    const values = await page.evaluate(({ side, view }) => {
      const host = document.querySelector(side === 'source' ? view === 'workspace' ? '.pop.floating' : '.fullstate' : view === 'workspace' ? '[role=menu]' : '[data-fullstate]');
      const elements = [host, ...host.querySelectorAll(view === 'workspace' ? side === 'source' ? '.mi,.ws-logo' : 'button,button>span:first-child' : 'h1,p,button')];
      return { rootMotion: document.documentElement.dataset.motion, html: host.outerHTML, animations: document.getAnimations().map(animation => ({ name: animation.animationName, currentTime: animation.currentTime, playState: animation.playState, timing: animation.effect?.getTiming(), keyframes: animation.effect?.getKeyframes() })), elements: elements.map(el => ({ html: el.outerHTML, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(el)].map(key => [key, getComputedStyle(el).getPropertyValue(key)])), parent: { html: el.parentElement.outerHTML.slice(0, 200), css: Object.fromEntries([...getComputedStyle(el.parentElement)].map(key => [key, getComputedStyle(el.parentElement).getPropertyValue(key)])) } })) };
    }, { side, view });
    const faces = await page.evaluate(() => [...document.fonts].filter(face => /Geist/.test(face.family)).map(face => ({ family: face.family.replaceAll('"', ''), weight: face.weight, status: face.status })));
    const id = `${side}-${mode}-${view}`;
    report.samples.push({ side, mode, view, fonts, faces, original: store(`${id}-original.json`, original), sourceFixture: store(`${id}-source-fixture.json`, fixture), targetDataset: store(`${id}-target-dataset.json`, dataset), computed: store(`${id}-computed.json`, values) }); save();
    if (verify) {
      assert.equal(fonts.length, 2); for (const font of fonts) assert.ok([{ bytes: 29288, sha256: '9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608' }, { bytes: 9872, sha256: '23840067d1dda8749b421a47c3e56205fa78c0d58d40baf3cc4d625fbe667f36' }].some(expected => font.status === 200 && font.bytes === expected.bytes && font.sha256 === expected.sha256));
      assert.deepEqual(faces.filter(face => face.status === 'loaded').map(face => `${face.family}:${face.weight}`).sort(), ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400'].sort());
      const host = values.elements[0], reduced = view === 'workspace' ? mode !== 'normal' : mode.startsWith('os-reduce');
      assert.equal(host.css['animation-duration'], reduced ? '0.12s' : view === 'workspace' ? '0.16s' : '0.36s'); assert.equal(host.css['animation-fill-mode'], 'both');
      assert.equal(host.css['animation-timing-function'], view === 'full404' && reduced ? 'ease' : 'cubic-bezier(0.23, 1, 0.32, 1)');
      assert.equal(host.css['animation-name'], reduced ? 'fadeOnly' : view === 'workspace' ? side === 'source' ? 'popIn' : 'ui-pop-in' : 'riseIn');
      if (view === 'workspace') for (const el of values.elements.filter(el => el.rect.width === 20 && el.rect.height === 20 && /^<span/.test(el.html) && !el.html.includes('<svg'))) { assert.equal(el.css['font-size'], '9px'); assert.equal(el.css['font-weight'], '600'); assert.equal(el.css['color'], 'rgb(255, 255, 255)'); }
    }
    await session.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = verify ? 'passed' : 'diagnosis-complete'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await sourceStop(); await targetStop(); }
