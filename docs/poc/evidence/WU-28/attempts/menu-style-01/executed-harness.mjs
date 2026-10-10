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
const report = { status: 'running', assetsBefore: assets(), immutableBefore: immutableInputs(), runtime: { node: process.version, ...environment }, qualification: 'Computed original native workspace-menu first lifecycle; four motion modes; diagnosis only, no visual acceptance.', samples: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const store = (name, value) => { const path = `${output}/${name}`, bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
let browser; const sourceStop = await sourceServer(), targetStop = await targetServer();
try {
  browser = await chromium.launch({ args: ['--disable-partial-raster'] });
  for (const mode of ['normal', 'stored-reduce', 'os-reduce', 'os-reduce-stored-full']) for (const side of ['source', 'target']) {
    const original = readJson(`${artifacts}/source-fixture.json`), fixture = structuredClone(original), dataset = createSeedDataset();
    const preference = mode === 'stored-reduce' ? 'reduce' : mode.endsWith('stored-full') ? 'full' : 'system';
    fixture.prefs.motion = preference; dataset.preferences.motion = preference;
    const session = await newPage(browser, {}, side === 'source' ? fixture : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173'), page = session.page;
    if (side === 'target') await session.context.addInitScript(({ dataset, key, fixtureSha256 }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })), { dataset, key: mockStorageKey(sourceId('workspaces', 'w1')), fixtureSha256: seedProvenance.fixtureSha256 });
    await page.emulateMedia({ reducedMotion: mode.startsWith('os-reduce') ? 'reduce' : 'no-preference' });
    await page.goto(side === 'source' ? 'http://127.0.0.1:4173/#states' : 'http://127.0.0.1:5173/dev/system-states');
    await page.waitForSelector(side === 'source' ? '.states-grid' : '[data-system-states]'); await ready(page);
    if (side === 'source') await page.locator('[data-pop=ws]').click(); else await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
    await page.waitForSelector(side === 'source' ? '.pop.floating' : '[role=menu]'); await ready(page);
    const values = await page.evaluate(side => {
      const host = document.querySelector(side === 'source' ? '.pop.floating' : '[role=menu]');
      const elements = [host, ...host.querySelectorAll(side === 'source' ? '.mi,.ws-logo' : 'button,button>span:first-child')];
      return { rootMotion: document.documentElement.dataset.motion, html: host.outerHTML, animations: document.getAnimations().map(animation => ({ name: animation.animationName, currentTime: animation.currentTime, playState: animation.playState, timing: animation.effect?.getTiming(), keyframes: animation.effect?.getKeyframes() })), elements: elements.map(el => ({ html: el.outerHTML, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(el)].map(key => [key, getComputedStyle(el).getPropertyValue(key)])), parent: { html: el.parentElement.outerHTML.slice(0, 200), css: Object.fromEntries([...getComputedStyle(el.parentElement)].map(key => [key, getComputedStyle(el.parentElement).getPropertyValue(key)])) } })) };
    }, side);
    const id = `${side}-${mode}`;
    report.samples.push({ side, mode, original: store(`${id}-original.json`, original), sourceFixture: store(`${id}-source-fixture.json`, fixture), targetDataset: store(`${id}-target-dataset.json`, dataset), computed: store(`${id}-computed.json`, values) }); save(); await session.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = 'diagnosis-complete'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await sourceStop(); await targetStop(); }
