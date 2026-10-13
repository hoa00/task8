import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, sha256, readJson } from '../reference/source-check.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { createSeedDataset } from '../../../apps/web/src/data/mock/seed.ts';
const attempt = process.argv[2];
if (!attempt) throw Error('Unique attempt required');
const output = `docs/poc/evidence/WU-26/attempts/${attempt}`;
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(import.meta.filename, `${output}/executed-verify.mjs`);
const routes = { login: '/login', signup: '/signup', forgot: '/forgot-password', 'forgot-sent': '/forgot-password?state=sent', reset: '/reset-password', 'reset-done': '/reset-password?state=done', verify: '/verify-email' };
const states = { login: ['base', 'invalid', 'pw-error', 'login-error', 'reveal', 'loading', 'social-loading'], signup: ['base', 'invalid', 'strength', 'loading'], forgot: ['base', 'invalid', 'loading'], 'forgot-sent': ['base'], reset: ['base', 'invalid', 'strength', 'loading'], 'reset-done': ['base'], verify: ['base', 'cooldown'] };
const smoke = process.argv.includes('--smoke');
let matrix = [1440, 390].flatMap(width => Object.keys(routes).flatMap(screen => (smoke ? ['base'] : states[screen]).map(state => ({ screen, state, width, id: `${screen}-${state}-${width}` }))));
const filter = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
if (filter) matrix = matrix.filter(row => filter.split(',').some(value => row.id.includes(value)));
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', runtime: { node: process.version, os: 'linux', ...environment }, immutableBefore: immutableInputs(), assetsBefore: assets(), threshold: 0, includeAA: true, maxDiffPixels: 0, masks: [], samples: [], captureLifecycle: { naturalFirst: process.argv.includes('--natural-first'), directSource: process.argv.includes('--direct-source'), clockInstalledBeforeBootstrap: true, pauseOffsetMilliseconds: 60000 }, fixtureProjection: 'Source original fixture and canonical Target seed; ordinary light/default harness preferences only. Ephemeral Source ui.auth/af/errors drafts and actual action transitions are recorded. Target error scenario persists only the noncredential label login-error; all credential inputs remain transient.', scope: 'Whole natural Auth viewport including visible header/card/footer on Linux Chromium145 BOTH --disable-partial-raster; desktop1440x1000/mobile390x844. Long signup offscreen footer separately reached by actual wheel. No Darwin, physical-device, full workspace shell, backend or real delivery claim.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
function compare(a, b, id) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height);
  const diff = new PNG({ width: x.width, height: x.height }), pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true });
  if (pixels) store(`${id}-diff.png`, PNG.sync.write(diff));
  return pixels;
}
async function setup(page, side, sample) {
  if (['loading', 'social-loading', 'cooldown'].includes(sample.state)) await page.clock.install({ time: new Date(environment.clock) });
  if (side === 'source') {
    if (process.argv.includes('--direct-source')) await page.goto(`http://127.0.0.1:4173/#${sample.screen}`);
    else { await page.goto('http://127.0.0.1:4173'); await sourcePreferences(page, { theme: 'light', accent: 'indigo', motion: 'system' }); await page.evaluate(async screen => { const { S } = await import('/src/core/store.js'), { render } = await import('/src/shell/render.js'); S.ui.auth = screen; S.ui.errors = {}; S.ui.af = { email: 'hello@gr8rstudio.com', name: '' }; S.ui.pwNew = ''; S.ui.resendT = 0; render(); }, sample.screen); }
    await ready(page); if (!process.argv.includes('--natural-first')) await page.evaluate(async () => (await import('/src/shell/render.js')).render());
  } else { await page.goto(`http://127.0.0.1:5173${routes[sample.screen]}`); await page.waitForSelector('[data-auth-card]'); }
  await ready(page);
  const ids = { login: ['l-email', 'l-pw'], signup: ['s-name', 's-email', 's-pw'], forgot: ['f-email'], reset: ['r-pw', 'r-pw2'] };
  if (sample.state === 'invalid') {
    if (sample.screen === 'login' || sample.screen === 'forgot') await page.locator(`#${ids[sample.screen][0]}`).fill('');
    if (sample.screen === 'reset') { await page.locator('#r-pw').fill('abc'); await page.locator('#r-pw2').fill('different'); }
    await page.locator(`#${sample.screen === 'forgot' ? 'forgot' : sample.screen}-btn`).click();
  }
  if (sample.state === 'pw-error') await page.locator('#login-btn').click();
  if (sample.state === 'strength') await page.locator(sample.screen === 'signup' ? '#s-pw' : '#r-pw').fill('abcdefghijk1!');
  if (sample.state === 'reveal') { await page.locator('#l-pw').fill('demo-preview'); await page.getByRole('button', { name: 'Show password', exact: true }).click(); }
  if (sample.state === 'login-error') {
    if (side === 'source') { await page.locator('#l-pw').fill('demo-error'); await page.evaluate(async () => { const { S } = await import('/src/core/store.js'); S.ui.errors = { login: 'Invalid email or password. Please try again.' }; (await import('/src/shell/render.js')).render(); }); }
    else { await page.locator('#l-pw').fill('demo-error'); await page.locator('#login-btn').click(); await page.getByRole('alert').waitFor(); await page.locator('#l-pw').fill(''); }
  }
  if (['loading', 'social-loading', 'cooldown'].includes(sample.state)) {
    await page.clock.pauseAt(new Date(Date.parse(environment.clock) + 60000));
    if (sample.state === 'cooldown') await page.locator('#resend-btn').click();
    else if (sample.state === 'social-loading') await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    else {
      if (sample.screen === 'login') await page.locator('#l-pw').fill('demo-pending');
      if (sample.screen === 'signup') { await page.locator('#s-name').fill('Demo Person'); await page.locator('#s-email').fill('demo@example.com'); await page.locator('#s-pw').fill('abcdefghijk1!'); }
      if (sample.screen === 'reset') { await page.locator('#r-pw').fill('abcdefghijk1!'); await page.locator('#r-pw2').fill('abcdefghijk1!'); }
      await page.locator(`#${sample.screen}-btn`).click();
    }
    await page.clock.runFor(40);
    if (sample.state === 'cooldown') await page.clock.runFor(4500);
  }
  if (!['loading', 'social-loading', 'cooldown'].includes(sample.state)) await ready(page);
  // Infinite shimmer/spinner are held at phase0 only for strict deterministic
  // raster comparisons. This is not a claim about live animation timing.
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (animation.effect?.getTiming().iterations === Infinity) { animation.pause(); animation.currentTime = 0; } });
  await page.mouse.move(sample.width - 1, sample.width === 1440 ? 999 : 843);
  if (process.argv.includes('--native-scroll') && sample.screen === 'signup' && sample.width === 390) {
    const selector = side === 'source' ? '.auth' : '[data-auth-layout]';
    await page.locator(selector).evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(100);
    await page.locator(selector).evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(100);
  }
}
let browser; const stopSource = await sourceServer(), stopTarget = await targetServer();
try {
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
  for (const sample of matrix) {
    const height = sample.width === 1440 ? 1000 : 844, fixture = readJson(`${artifacts}/source-fixture.json`), dataset = createSeedDataset();
    Object.assign(fixture.prefs, { theme: 'light', accent: 'indigo', motion: 'system' });
    const sourceFixture = store(`${sample.id}-source-fixture.json`, Buffer.from(JSON.stringify(fixture, null, 2) + '\n'));
    const targetFixture = store(`${sample.id}-target-fixture.json`, Buffer.from(JSON.stringify({ dataset, scenario: sample.state === 'login-error' ? 'login-error' : 'normal', clock: environment.clock, ephemeralDraft: { email: 'hello@gr8rstudio.com', name: '' } }, null, 2) + '\n'));
    const config = { viewport: { width: sample.width, height }, mobile: sample.width === 390 }, a = await newPage(browser, config, fixture, true, 'http://127.0.0.1:4173'), b = await newPage(browser, config, undefined, true, 'http://127.0.0.1:5173');
    await b.context.addInitScript(scenario => { localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme: 'light', accent: 'indigo', motion: 'system' })); localStorage.setItem('task8.demo.auth.scenario.v1', scenario); }, sample.state === 'login-error' ? 'login-error' : 'normal');
    const responses = [[], []], pending = [];
    for (const [session, side] of [[a, 0], [b, 1]]) session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); responses[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
    for (const [page, side] of [[a.page, 'source'], [b.page, 'target']]) { report.active = { id: sample.id, side }; save(); await setup(page, side, sample); }
    const selectors = ['.auth', '[data-auth-layout]'], boxes = await Promise.all([a.page.locator(selectors[0]).boundingBox(), b.page.locator(selectors[1]).boundingBox()]);
    const clips = boxes.map(box => ({ x: Math.floor(box.x), y: Math.floor(box.y), width: Math.min(sample.width, Math.ceil(box.x + box.width)) - Math.floor(box.x), height: Math.min(height, Math.ceil(box.y + box.height)) - Math.floor(box.y) }));
    const shot = (page, index) => page.screenshot({ clip: clips[index], animations: 'disabled', caret: 'hide' });
    for (let i = 0; i < 2; i++) { await shot(a.page, 0); await shot(b.page, 1); }
    const bytes = [await shot(a.page, 0), await shot(b.page, 1), await shot(a.page, 0), await shot(b.page, 1)];
    const images = bytes.map((bytes, index) => store(`${sample.id}-${['source', 'target', 'source-repeat', 'target-repeat'][index]}.png`, bytes));
    const geometry = await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.querySelectorAll('.auth-card>* ,[data-auth-card]>* ,.auth input,[data-auth-layout] input,.auth h1,[data-auth-layout] h1')].map(el => ({ tag: el.tagName, text: el.textContent, id: el.id, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries(['display', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'margin', 'color', 'background', 'gap'].map(key => [key, getComputedStyle(el)[key]])) })))));
    await Promise.all(pending);
    const changedPixels = compare(bytes[0], bytes[1], sample.id), sourceRepeatPixels = compare(bytes[0], bytes[2], `${sample.id}-source-repeat`), targetRepeatPixels = compare(bytes[1], bytes[3], `${sample.id}-target-repeat`);
    const loaded = await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight, status: face.status })))));
    const activeElements = await Promise.all([a.page, b.page].map(page => page.evaluate(() => ({ id: document.activeElement?.id, tag: document.activeElement?.tagName }))));
    const actualCaptureState = await Promise.all([a.page, b.page].map(page => page.evaluate(() => ({ authLayout: [...document.querySelectorAll('.auth,[data-auth-layout],.auth-c,[data-auth-content],.auth-card,[data-auth-card]')].map(el => ({ rect: el.getBoundingClientRect().toJSON(), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, className: el.className, attributes: { entrance: el.getAttribute('data-auth-enter') } })), inputs: [...document.querySelectorAll('.auth input,[data-auth-layout] input')].map(el => ({ id: el.id, type: el.type, length: el.value.length, checked: el.checked, disabled: el.disabled })), errors: [...document.querySelectorAll('.err,[role=alert]')].map(el => el.textContent), busy: [...document.querySelectorAll('[aria-busy=true]')].map(el => el.id), cooldown: document.querySelector('#resend-t')?.textContent ?? null, subtitleDisplay: getComputedStyle(document.querySelector('.auth-card .sub,[data-auth-subtitle]')).display }))));
    const captureStates = store(`${sample.id}-capture-state.json`, Buffer.from(JSON.stringify(actualCaptureState, null, 2) + '\n'));
    report.samples.push({ sample, sourceFixture, targetFixture, fixtureQualification: 'Initial factory/seed + declared draft; exact executed harness steps reconstruct transient flow. Actual bounded capture state stores lengths/bools/errors/clock, never credential values.', captureStates, boxes, clips, geometryEqual: JSON.stringify(boxes[0]) === JSON.stringify(boxes[1]), images, changedPixels, sourceRepeatPixels, targetRepeatPixels, geometry, timerProjection: ['loading', 'social-loading', 'cooldown'].includes(sample.state) ? 'Actual Source and Target handlers; clock installed before bootstrap and paused at base+60000 after ready, then runFor40; cooldown additionally runFor4500 to let feedback toast expire. Infinite animation phase0 raster only.' : null, fonts: { responses, loaded }, activeElements });
    save(); console.log(`${sample.id}: pixels${changedPixels} repeat${sourceRepeatPixels + targetRepeatPixels}`); await a.context.close(); await b.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource();
  report.status = report.samples.every(row => row.geometryEqual && !row.changedPixels && !row.sourceRepeatPixels && !row.targetRepeatPixels) ? 'passed' : 'failed'; save(); assert.equal(report.status, 'passed');
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); await stopTarget(); await stopSource(); }
