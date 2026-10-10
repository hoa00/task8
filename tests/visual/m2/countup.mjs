import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { targetServer, ready } from '../tasks/verify.mjs';
import { readiness } from '../reference/source-driver.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, readJson, sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { createSeedDataset, seedProvenance } from '../../../apps/web/src/data/mock/seed.ts';
import { mockStorageKey } from '../../../apps/web/src/data/mock/persistence.ts';
import { workspaceId } from './matrix.mjs';

const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique count-up attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', scope: 'Original native sidebar keyboard Projects to Home/Overview after a declared native warm visit and return to Projects. Playwright browser clock installed before bootstrap. Observational RAF wrappers preserve original scheduling, callback timestamps and cancellation; Node-side readiness pumps retain every pre-ready prefix. Each side is checked against its actual original start and the callback timestamp that produced its value, with direct equality only at matching elapsed phases. This is JavaScript count-up evidence, separate from CSS images; no renderer/style edits or invented wall-clock phases.', runtime: { node: process.version, ...environment }, assetsBefore: assets(), immutableBefore: immutableInputs(), profiles: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const observe = (page, side) => page.evaluate(side => ({ now: Date.now(), performance: performance.now(), storedMotion: document.documentElement.dataset.motion, osReduce: matchMedia('(prefers-reduced-motion:reduce)').matches, sourceRoute: window.__gr8r?.S.ui.route ?? null, url: location.href, raf: window.__wu29RafTrace ?? [], metrics: [...document.querySelectorAll(side === 'source' ? '.stat .v' : '[data-metric]')].map(el => ({ text: el.textContent, label: side === 'source' ? el.previousElementSibling?.textContent : el.dataset.metric, value: el.dataset.metricValue ?? null, start: el.dataset.countupStart ?? null, state: el.dataset.countupState ?? null })) }), side);
const traceRaf = (page, side) => page.evaluate(side => {
 const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window), trace = []; let active = null;
 window.__wu29RafTrace = trace;
 window.requestAnimationFrame = callback => {
  const code = String(callback), record = { kind: 'request', requestPerf: performance.now(), parent: active, code, countup: side === 'source' ? code.includes('Math.pow') && code.includes('el.textContent') : code.includes('520') && code.includes('requestAnimationFrame') };
  const id = request(timestamp => { trace.push({ kind: 'callback', id, timestamp, performance: performance.now(), countup: record.countup }); const prior = active; active = id; try { callback(timestamp); } finally { active = prior; } });
  record.id = id; trace.push(record); return id;
 };
 window.cancelAnimationFrame = id => { trace.push({ kind: 'cancel', id, performance: performance.now() }); return cancel(id); };
}, side);
const hostTick = async (pages, increment) => { for (const page of pages) await page.clock.runFor(increment); await new Promise(resolve => setTimeout(resolve, 20)); };
const validatePhase = (state, warm, side, animated) => {
 const roots = state.raf.filter(row => row.kind === 'request' && row.countup && row.parent === null), starts = roots.map(row => row.requestPerf), callbacks = state.raf.filter(row => row.kind === 'callback' && row.countup);
 const eligible = warm.metrics.filter(metric => Number.parseInt(metric.text, 10) >= 2);
 if (animated) assert.equal(roots.length, eligible.length, `${side} actual CountUp request roots`); else assert.equal(roots.length, 0);
 const observedStart = side === 'target' ? state.metrics.filter(metric => Number.parseInt(metric.value, 10) >= 2).map(metric => Number(metric.start)) : starts;
 if (animated) { assert.ok(observedStart.every(start => start === observedStart[0])); assert.ok(starts.every(start => start === observedStart[0])); }
 const lastTimestamp = callbacks.at(-1)?.timestamp ?? null, elapsed = animated ? lastTimestamp === null ? 0 : lastTimestamp - observedStart[0] : null;
 const expected = warm.metrics.map(metric => { const match = /^(\d+)(%?)$/.exec(metric.text); if (!animated || !match || Number(match[1]) < 2) return metric.text; const k = Math.min(1, elapsed / 520); return `${Math.round(Number(match[1]) * (1 - (1 - k) ** 3))}${match[2]}`; });
 assert.deepEqual(state.metrics.map(metric => metric.text), expected, `${side} original 520ms cubic at actual callback phase`);
 return { start: animated ? observedStart[0] : null, lastCallbackTimestamp: lastTimestamp, elapsed, expected, requestRoots: roots.map(({ id, requestPerf }) => ({ id, requestPerf })) };
};
let browser, stopSource, stopTarget;
try {
 stopSource = await sourceServer(); stopTarget = await targetServer(); checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
 for (const mode of ['normal','stored-reduce','os-reduce','full-os']) for (const route of ['home','overview']) {
  const id = `${mode}-${route}`, prefs = { theme: 'light', accent: 'indigo', motion: mode === 'stored-reduce' ? 'reduce' : mode === 'full-os' ? 'full' : 'system' }, fixture = readJson(`${artifacts}/source-fixture.json`), dataset = createSeedDataset(); Object.assign(fixture.prefs, prefs); Object.assign(dataset.preferences, prefs);
  const profile = { id, route, prefs, status: 'running', samples: [], fixtures: { source: store(`${id}-source-fixture.json`, Buffer.from(`${JSON.stringify(fixture)}\n`)), target: store(`${id}-target-fixture.json`, Buffer.from(`${JSON.stringify(dataset)}\n`)) }, qualification: mode === 'full-os' ? 'QUIRK-03 Source full/no-preference named-full reference versus Target full/OS-reduce; raw Source OS-full bug separately recorded by route-motion.' : null }; report.profiles.push(profile); save();
  const a = await newPage(browser, {}, fixture), b = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'), pending = [], fonts = [[],[]], errors = [[],[]];
  try {
   for (const [session, side] of [[a,0],[b,1]]) { session.page.setDefaultTimeout(12000); await session.page.clock.install({ time: new Date(environment.clock) }); await session.page.emulateMedia({ reducedMotion: mode === 'os-reduce' || mode === 'full-os' && side === 1 ? 'reduce' : 'no-preference' }); session.page.on('pageerror', error => errors[side].push(String(error))); session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); fonts[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); }); }
   await b.context.addInitScript(({ prefs, dataset, key, fixtureSha256 }) => { localStorage.setItem('task8.ui.theme.v1', JSON.stringify(prefs)); localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })); }, { prefs, dataset, key: mockStorageKey(workspaceId), fixtureSha256: seedProvenance.fixtureSha256 });
   await a.page.goto('http://127.0.0.1:4173/#projects'); await a.page.waitForFunction(() => !!window.__gr8r); await b.page.goto(`http://127.0.0.1:5173/w/${workspaceId}/projects`); await readiness(a.page); await ready(b.page); await Promise.all(pending);
   await a.page.locator(`.side [data-a="go"][data-r="${route}"]`).first().press('Enter');
   await b.page.getByRole('navigation', { name: 'Main', exact: true }).locator(`a[href="/w/${workspaceId}/${route}"]`).press('Enter');
   await a.page.waitForFunction(() => document.querySelectorAll('.stat .v').length === 4); await b.page.waitForFunction(() => document.querySelectorAll('[data-metric]').length === 4); await ready(a.page); await ready(b.page);
   profile.warmDashboard = await Promise.all([[a.page,'source'],[b.page,'target']].map(([page,side]) => observe(page,side))); save(); assert.deepEqual(profile.warmDashboard[0].metrics.map(metric => metric.text), profile.warmDashboard[1].metrics.map(metric => metric.text));
   await a.page.locator('.side [data-a="go"][data-r="projects"]').first().press('Enter'); await b.page.getByRole('navigation', { name: 'Main', exact: true }).locator(`a[href="/w/${workspaceId}/projects"]`).press('Enter'); await ready(a.page); await ready(b.page);
   profile.preEntry = await Promise.all([[a.page,'source'],[b.page,'target']].map(([page,side]) => observe(page,side))); save();
   for (const page of [a.page,b.page]) await page.clock.pauseAt(new Date(Date.parse(environment.clock) + 60000));
   profile.pausedBeforeEntry = await Promise.all([[a.page,'source'],[b.page,'target']].map(([page,side]) => observe(page,side))); save();
   await traceRaf(a.page,'source'); await traceRaf(b.page,'target');
   profile.entryBracket = { before: await observe(a.page,'source') };
   await a.page.locator(`.side [data-a="go"][data-r="${route}"]`).first().press('Enter');
   profile.entryBracket.afterSource = await observe(a.page,'source'); save();
   await b.page.getByRole('navigation', { name: 'Main', exact: true }).locator(`a[href="/w/${workspaceId}/${route}"]`).press('Enter');
   profile.preReadyPrefix = [];
   for (let tick = 0; tick < 100; tick++) { await hostTick([a.page,b.page], tick === 0 ? 0 : 16); const state = await Promise.all([[a.page,'source'],[b.page,'target']].map(([page,side]) => observe(page,side))); profile.preReadyPrefix.push({ tick, state }); save(); if (state.every(row => row.metrics.length === 4) && state[1].metrics.every(metric => !['normal','full-os'].includes(mode) || Number(metric.value) < 2 || metric.start !== null)) break; }
   assert.ok(profile.preReadyPrefix.at(-1).state.every(row => row.metrics.length === 4), 'Actual host-polled ready metrics');
   for (const increment of [0,80,180,260,180]) { await hostTick([a.page,b.page],increment); const state = await Promise.all([[a.page,'source'],[b.page,'target']].map(([page,side]) => observe(page,side))); const sample = { increment, state }; profile.samples.push(sample); save(); sample.actualPhase = state.map((row,index) => validatePhase(row,profile.warmDashboard[index],index === 0 ? 'source' : 'target',['normal','full-os'].includes(mode))); sample.equalElapsed = sample.actualPhase[0].elapsed === sample.actualPhase[1].elapsed; save(); if (sample.equalElapsed) assert.deepEqual(state[0].metrics.map(metric => metric.text),state[1].metrics.map(metric => metric.text)); }
   profile.fonts = { responses: fonts, loaded: await Promise.all([a.page,b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight }))))) }; profile.errors = errors; save();
   assert.deepEqual(errors,[[],[]]); for (const side of fonts) { assert.equal(side.length,2); for (const font of side) { assert.equal(font.status,200); assert.ok(readJson(`${artifacts}/font-assets.json`).assets.some(asset => asset.sha256 === font.sha256)); } }
   for (const faces of profile.fonts.loaded) for (const spec of ['Geist:400','Geist:500','Geist:600','Geist Mono:400']) assert.ok(faces.some(face => `${face.family.replaceAll('"','')}:${face.weight}` === spec));
   const values = profile.samples.map(sample => sample.state[1].metrics.map(metric => metric.text)); assert.deepEqual(profile.samples.at(-1).state[0].metrics.map(metric => metric.text), profile.samples.at(-1).state[1].metrics.map(metric => metric.text)); assert.deepEqual(values.at(-1),profile.warmDashboard[1].metrics.map(metric => metric.text));
   if (['normal','full-os'].includes(mode)) { assert.ok(values[0].some((value,index) => value !== values.at(-1)[index])); assert.ok(values[1].some((value,index) => value !== values[0][index] && value !== values.at(-1)[index])); }
   else assert.ok(values.every(value => JSON.stringify(value) === JSON.stringify(values.at(-1))));
   profile.status = 'passed';
  } catch (error) { profile.status = 'failed'; profile.error = String(error.stack); profile.errors = errors; profile.fonts ??= { responses: fonts }; }
  save(); console.log(`${id}: ${profile.status}`); await a.context.close(); await b.context.close();
 }
 report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore,report.assetsAfter); assert.deepEqual(report.immutableBefore,report.immutableAfter); checkSource(); report.status = report.profiles.every(profile => profile.status === 'passed') ? 'passed' : 'failed'; save(); if (report.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await stopTarget?.(); await stopSource?.(); }
