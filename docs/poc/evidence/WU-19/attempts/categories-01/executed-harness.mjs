import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, readJson, sha256 } from '../reference/source-check.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
const root = 'docs/poc/evidence/WU-19', attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('A unique executed attempt is required');
const output = `${root}/attempts/${attempt}`; if (fs.existsSync(output)) throw Error('Never overwrite executed evidence'); fs.mkdirSync(output, { recursive: true });
fs.copyFileSync('tests/visual/notifications/verify.mjs', `${output}/executed-harness.mjs`);
const workspaceId = sourceId('workspaces', 'w1'), matrix = [];
for (const width of [1440, 390]) {
  for (const state of ['unselected', 'task', 'notice', 'unread', 'mentions', 'assignments', 'comments', 'updates', 'empty']) matrix.push({ surface: 'inbox', width, state });
  for (const state of ['all', 'unread', 'empty']) matrix.push({ surface: 'notifications', width, state });
}
for (const width of [899, 900, 901]) for (const state of ['unselected', 'task', 'notice']) matrix.push({ surface: 'inbox', width, state });
for (const surface of ['inbox', 'notifications']) matrix.push({ surface, width: 1440, state: surface === 'inbox' ? 'task' : 'all', theme: 'dark' });
const selected = process.argv.includes('--affected-categories') ? matrix.filter(row => row.surface === 'inbox' && ['mentions', 'assignments', 'comments', 'updates'].includes(row.state)) : process.argv.includes('--inbox-smoke') ? matrix.filter(row => row.width === 1440 && !row.theme && row.surface === 'inbox' && ['unselected', 'task', 'notice'].includes(row.state)) : process.argv.includes('--smoke') ? matrix.filter(row => row.width === 1440 && !row.theme && ['unselected', 'task', 'notice', 'all'].includes(row.state)) : process.argv.includes('--affected-preview') ? matrix.filter(row => row.surface === 'inbox' && row.state === 'task') : matrix;
export function immutableInputs() { return Object.fromEntries(['baseline-manifest.json', 'font-assets.json', 'source-fixture.json', 'source-lock.json'].map(name => [name, sha256(fs.readFileSync(`${artifacts}/${name}`))])); }
export function implementationAssets() { const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps/web/src', 'packages', 'apps/web/vite.config.ts', 'package.json', 'pnpm-lock.yaml'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); const walk = dir => { for (const file of fs.readdirSync(dir, { withFileTypes: true })) { const name = `${dir}/${file.name}`; if (file.isDirectory()) walk(name); else names.push(name); } }; walk('apps/web/dist'); return Object.fromEntries([...new Set(names)].sort().map(name => [name, sha256(fs.readFileSync(name))])); }
const report = { status: 'running', invocation: [process.execPath, ...process.argv.slice(1)], output, sourceSha: '904205c626918ee96054eb35495c394a60c0c601', threshold: 0, includeAA: true, maxDiffPixels: 0, masks: [], samples: [], immutableBefore: immutableInputs(), implementationAssetsBefore: implementationAssets(), runtime: { node: process.version, ...environment }, scope: 'WU19 content and inclusive fullscreen Inbox preview. Both Source and Target matched Linux Chromium145 --disable-partial-raster. Original Source fixture/order/styles remain unchanged. No default/Darwin/fullshell/device/user/fullproject parity.', rootReview: 'pending', harnessInputs: Object.fromEntries(['tests/visual/notifications/verify.mjs', 'tests/visual/reference/environment.mjs', 'tests/visual/reference/source-server.mjs', 'tests/visual/tasks/verify.mjs'].map(name => [name, sha256(fs.readFileSync(name))])) };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
function compare(a, b, id) { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const diff = new PNG({ width: x.width, height: x.height }), pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true }); if (pixels) fs.writeFileSync(`${output}/${id}-diff.png`, PNG.sync.write(diff)); return pixels; }
async function navigate(page, side, sample) {
  if (sample.width <= 900) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main', exact: true }).locator(side === 'source' ? `[data-r="${sample.surface}"]` : `a[href$="/${sample.surface}"]`).click();
  if (side === 'target') await page.waitForSelector('[data-notifications-ready]');
  if (sample.state === 'task' || sample.state === 'notice') {
    const sourceKey = sample.state === 'task' ? 'n1' : 'n6', id = side === 'source' ? sourceKey : sourceId('notifs', sourceKey);
    await page.locator(side === 'source' ? `[data-a=selNotif][data-id="${id}"]` : `[data-notification-id="${id}"]`).click();
    if (side === 'target' && sample.state === 'task') await page.waitForSelector('[data-conversation-ready]');
  } else if (sample.state === 'empty') {
    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await page.locator(side === 'source' ? '.toast' : '.ui-toast').waitFor();
    await page.locator(side === 'source' ? '.toast' : '.ui-toast').waitFor({ state: 'detached', timeout: 5000 });
  }
  if (['unread', 'empty'].includes(sample.state)) {
    if (sample.surface === 'inbox') await page.getByRole(side === 'source' ? 'checkbox' : 'switch', { name: 'Unread', exact: true }).check();
    else await page.locator(side === 'source' ? '.page .seg' : '[data-notifications-page] [role=radiogroup]').getByRole(side === 'source' ? 'button' : 'radio', { name: 'Unread', exact: true }).click();
  } else if (['mentions', 'assignments', 'comments', 'updates'].includes(sample.state)) await page.getByRole('tab', { name: new RegExp(`^${sample.state[0].toUpperCase()}${sample.state.slice(1)}`) }).click();
  await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(sample.width - 1, sample.width === 390 ? 843 : 999); await ready(page);
}
let browser; const stopSource = await sourceServer(), stopTarget = await targetServer();
try {
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.profile = { name: 'matched-full-raster-linux-WU19', appliesTo: 'Both Source and Target', actualLaunchArguments: (await cdp.send('Browser.getBrowserCommandLine')).arguments }; await cdp.detach();
  for (const sample of selected) {
    const height = sample.width === 390 ? 844 : 1000, theme = sample.theme ?? 'light', id = `${sample.surface}-${sample.state}-${sample.width}-${theme}`;
    const a = await newPage(browser, { viewport: { width: sample.width, height }, mobile: sample.width === 390 }, readJson(`${artifacts}/source-fixture.json`)), b = await newPage(browser, { viewport: { width: sample.width, height }, mobile: sample.width === 390 }, undefined, true, 'http://127.0.0.1:5173');
    const targetFonts = [], promises = []; b.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) promises.push((async () => { const bytes = await response.body(), hash = sha256(bytes); assert.equal(response.status(), 200); assert.ok(readJson(`${artifacts}/font-assets.json`).assets.some(row => row.sha256 === hash)); targetFonts.push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: hash }); })()); });
    await b.context.addInitScript(theme => localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme, accent: 'indigo', density: 'comfortable', motion: 'system' })), theme);
    await a.page.goto('http://127.0.0.1:4173'); await sourcePreferences(a.page, { theme, accent: 'indigo', density: 'comfortable', motion: 'system' }); await b.page.goto(`http://127.0.0.1:5173/w/${workspaceId}/home`); await b.page.waitForSelector('[data-dashboard-ready]');
    for (const [page, side] of [[a.page, 'source'], [b.page, 'target']]) { report.active = { id, sample, side, stage: 'native-navigation-actions' }; save(); await ready(page); await navigate(page, side, sample); }
    const fullscreen = sample.surface === 'inbox' && ['task', 'notice'].includes(sample.state) && sample.width <= 900, selectors = fullscreen ? ['.inbox-prev', '[data-inbox-preview]'] : ['.content', '#main-content'];
    const geometry = await Promise.all([a.page, b.page].map((page, index) => page.locator(selectors[index]).evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), scrollTop: el.scrollTop, css: Object.fromEntries(['display', 'position', 'zIndex', 'transform', 'animation', 'overflowY'].map(key => [key, getComputedStyle(el)[key]])) }))));
    const clips = geometry.map(({ rect }) => ({ x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.min(sample.width, Math.ceil(rect.right)) - Math.floor(rect.x), height: Math.min(height, Math.ceil(rect.bottom)) - Math.floor(rect.y) })), geometryEqual = JSON.stringify(clips[0]) === JSON.stringify(clips[1]), clip = geometryEqual ? clips[0] : { x: 0, y: 0, width: sample.width, height };
    const snapshot = page => page.screenshot({ clip, animations: 'disabled', caret: 'hide' }); for (let n = 0; n < 2; n++) for (const page of [a.page, b.page]) await snapshot(page);
    const source = await snapshot(a.page), target = await snapshot(b.page), sourceRepeat = await snapshot(a.page), targetRepeat = await snapshot(b.page);
    for (const [side, bytes] of [['source', source], ['target', target], ['source-repeat', sourceRepeat], ['target-repeat', targetRepeat]]) fs.writeFileSync(`${output}/${id}-${side}.png`, bytes);
    const leaves = await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.querySelectorAll('.inbox-grid,.inbox-prev,.inbox-list,.inbox-tabs,.inbox-tabs button,.page h1,.page h2,.page .day-h,.page .nrow,.page .av,.page .cbox,.page textarea,.page .cmt,.page .pill,.page .empty-state,[data-inbox-page] h1,[data-inbox-page] h2,[data-inbox-preview],[data-inbox-page] .ui-tab,[data-inbox-page] [role=img],[data-inbox-page] textarea,[data-inbox-page] [data-comment-id],[data-notifications-page] h1,[data-notifications-page] section,[data-notifications-page] [data-notification-id]')].map(el => ({ tag: el.tagName, text: el.textContent, className: el.className, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(el)].filter(key => !key.startsWith('--')).map(key => [key, getComputedStyle(el).getPropertyValue(key)])), animations: el.getAnimations().map(animation => ({ playState: animation.playState, timing: animation.effect?.getTiming() })), ancestors: [el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean).map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON(), animation: getComputedStyle(el).animation, transform: getComputedStyle(el).transform })) })))));
    for (const result of await Promise.allSettled(promises)) assert.equal(result.status, 'fulfilled', result.reason?.message);
    const changedPixels = compare(source, target, id), repeatabilityPixels = compare(source, sourceRepeat, `${id}-source-repeat`) + compare(target, targetRepeat, `${id}-target-repeat`);
    report.samples.push({ id, sample, fixtureProjection: 'OriginalSourceFixture; native view/actions only', geometry, clips, geometryEqual, clip, leaves, changedPixels, repeatabilityPixels, sourceSha256: sha256(source), targetSha256: sha256(target), sourceRepeatSha256: sha256(sourceRepeat), targetRepeatSha256: sha256(targetRepeat), fonts: { sourceRequests: a.requests, targetResponses: targetFonts, loaded: await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight, status: face.status }))))) } }); save(); console.log(`${id}: pixels${changedPixels} repeat${repeatabilityPixels} geometry${geometryEqual}`); await a.context.close(); await b.context.close();
  }
  report.immutableAfter = immutableInputs(); report.implementationAssetsAfter = implementationAssets(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.implementationAssetsBefore, report.implementationAssetsAfter); checkSource();
  report.status = report.samples.every(row => row.changedPixels === 0 && row.repeatabilityPixels === 0 && row.geometryEqual) ? 'passed' : 'failed'; save(); assert.equal(report.status, 'passed');
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await stopTarget(); await stopSource(); }
