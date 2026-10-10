import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, sha256, readJson } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { createSeedDataset } from '../../../apps/web/src/data/mock/seed.ts';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-27/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', assetsBefore: assets(), immutableBefore: immutableInputs(), runtime: { node: process.version, os: 'linux', ...environment }, samples: [], threshold: 0, includeAA: true, masks: [], scope: 'Actual whole natural 1440x1000/390x844 viewport, original Source first onboarding lifecycle then real native transitions. Both --disable-partial-raster. URL demo hint and saved demo invitations are intentional copy conflicts; full raw differences retained, never counted strict whole parity. No rendered Source changes, masks, baseline updates or historical debt recovery.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const cases = [...Array.from({ length: 6 }, (_, step) => ({ step, state: 'base' })), { step: 1, state: 'populated' }, { step: 1, state: 'invalid' }, { step: 2, state: 'selected' }, { step: 3, state: 'selected' }, { step: 4, state: 'populated' }, { step: 5, state: 'invited' }];
async function setup(page, side, sample) {
  await page.goto(side === 'source' ? 'http://127.0.0.1:4173/#onboarding' : 'http://127.0.0.1:5173/onboarding?step=0');
  await page.waitForSelector(side === 'source' ? '.onb' : '[data-onboarding-step]'); await ready(page);
  const next = () => page.locator('#onb-next').click();
  for (let step = 0; step < sample.step; step++) { if (step === 1) await page.locator('#o-ws').fill('Demo Studio'); if (step === 4 && sample.state === 'invited') { await page.locator('#o-inv-0').fill('one@example.com'); await page.locator('#o-inv-1').fill('two@example.com'); } await next(); await page.waitForTimeout(30); await ready(page); }
  if (sample.step === 1 && sample.state === 'populated') await page.locator('#o-ws').fill('Demo Studio');
  if (sample.state === 'invalid') await next();
  if (sample.state === 'selected') await page.getByRole('radio', { name: sample.step === 2 ? /^Timelines/ : /^Design Project/ }).click();
  if (sample.step === 4 && sample.state === 'populated') await page.locator('#o-inv-0').fill('one@example.com');
  await ready(page); await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(sample.width - 1, sample.height - 1);
}
function comparison(a, b, name) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height);
  const diff = new PNG({ width: x.width, height: x.height }); const pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true });
  const image = store(`${name}-diff.png`, PNG.sync.write(diff)); let bounds = null;
  for (let index = 0; index < x.width * x.height; index++) { if ([0, 1, 2, 3].some(channel => x.data[index * 4 + channel] !== y.data[index * 4 + channel])) { const px = index % x.width, py = Math.floor(index / x.width); if (!bounds) bounds = { left: px, right: px, top: py, bottom: py }; else { bounds.left = Math.min(bounds.left, px); bounds.right = Math.max(bounds.right, px); bounds.top = Math.min(bounds.top, py); bounds.bottom = Math.max(bounds.bottom, py); } } }
  return { pixels, bounds, image };
}
let browser; const stopSource = await sourceServer(), stopTarget = await targetServer();
try {
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
  for (const width of [1440, 390]) for (const row of cases) {
    const sample = { ...row, width, height: width === 1440 ? 1000 : 844, id: `step${row.step}-${row.state}-${width}` };
    const original = readJson(`${artifacts}/source-fixture.json`), fixture = structuredClone(original); Object.assign(fixture.prefs, { theme: 'light', accent: 'indigo', motion: 'system' });
    const sourceFixture = store(`${sample.id}-source-original.json`, Buffer.from(JSON.stringify(original, null, 2) + '\n'));
    const sourceInitial = store(`${sample.id}-source-initial.json`, Buffer.from(JSON.stringify(fixture, null, 2) + '\n'));
    const targetFixture = store(`${sample.id}-target-seed.json`, Buffer.from(JSON.stringify({ dataset: createSeedDataset(), capabilities: 'Actual canonical mock', initial: 'Source defaults, no saved draft', scenario: sample }, null, 2) + '\n'));
    const config = { viewport: { width, height: sample.height }, mobile: width === 390 }, a = await newPage(browser, config, fixture), b = await newPage(browser, config, undefined, true, 'http://127.0.0.1:5173');
    await b.context.addInitScript(() => localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme: 'light', accent: 'indigo', motion: 'system' })));
    const responses = [[], []], pending = [];
    for (const [session, side] of [[a, 0], [b, 1]]) session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); responses[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
    for (const [page, side] of [[a.page, 'source'], [b.page, 'target']]) { report.active = { id: sample.id, side }; save(); await setup(page, side, sample); }
    const capture = async page => page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, layout: [...document.querySelectorAll('.auth,.auth-card,.auth-c,[data-auth-layout],[data-auth-content],[data-onboarding-step]')].map(el => ({ rect: el.getBoundingClientRect().toJSON(), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })), headings: [...document.querySelectorAll('h1')].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })), inputs: [...document.querySelectorAll('input')].map(el => ({ id: el.id, value: el.value, rect: el.getBoundingClientRect().toJSON(), focus: document.activeElement === el })), radios: [...document.querySelectorAll('[role=radio]')].map(el => ({ text: el.textContent, selected: el.getAttribute('aria-checked'), rect: el.getBoundingClientRect().toJSON() })), text: document.querySelector('.auth-card,[data-onboarding-step]')?.innerText, faces: [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight, status: face.status })) }));
    const state = await Promise.all([a.page, b.page].map(capture)), captureStates = store(`${sample.id}-capture.json`, Buffer.from(JSON.stringify(state, null, 2) + '\n'));
    const clip = { x: 0, y: 0, width, height: sample.height }, shot = page => page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
    const bytes = [await shot(a.page), await shot(b.page), await shot(a.page), await shot(b.page)]; const images = bytes.map((body, index) => store(`${sample.id}-${['source', 'target', 'source-repeat', 'target-repeat'][index]}.png`, body));
    const diff = comparison(bytes[0], bytes[1], sample.id), sourceRepeat = comparison(bytes[0], bytes[2], `${sample.id}-source-repeat`), targetRepeat = comparison(bytes[1], bytes[3], `${sample.id}-target-repeat`);
    await Promise.all(pending); const copyConflict = sample.state === 'populated' && sample.step === 1 ? 'URL availability is a demo URL, no domain check' : sample.state === 'invited' ? 'Saved demo invitations, no email sent' : null;
    report.samples.push({ sample, sourceFixture, sourceInitial, targetFixture, captureStates, images, clip, comparison: diff, sourceRepeat, targetRepeat, copyConflict, fonts: { responses, loaded: state.map(row => row.faces) }, geometry: state.map(row => ({ layout: row.layout, headings: row.headings, inputs: row.inputs, radios: row.radios })) }); save();
    console.log(`${sample.id}: pixels${diff.pixels} repeat${sourceRepeat.pixels + targetRepeat.pixels}${copyConflict ? ' declared-copy' : ''}`); await a.context.close(); await b.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource();
  report.status = report.samples.every(row => !row.sourceRepeat.pixels && !row.targetRepeat.pixels && (row.copyConflict || !row.comparison.pixels)) ? 'passed-qualified' : 'failed'; save(); assert.equal(report.status, 'passed-qualified');
} catch (error) { report.status = 'failed'; report.error = String(error); save(); throw error; }
finally { if (browser) await browser.close(); await stopTarget(); await stopSource(); }
