import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
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
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const selectedRoutes = process.argv.find(arg => arg.startsWith('--routes='))?.slice(9).split(',') ?? ['tasks', 'mytasks', 'calendar', 'timeline'];
const selectedModes = process.argv.find(arg => arg.startsWith('--modes='))?.slice(8).split(',') ?? ['normal', 'stored-reduce', 'os-reduce'];
assert.ok(selectedRoutes.length && selectedModes.length);
assert.ok(selectedRoutes.every(route => ['tasks','mytasks','calendar','timeline','home','overview'].includes(route)));
assert.ok(selectedModes.every(mode => ['normal','stored-reduce','os-reduce','full-os'].includes(mode)));
if (selectedModes.includes('full-os')) assert.ok(process.argv.includes('--canonical-full-os'), 'Full OS Source quirk correction must be explicitly selected');
const frames = process.argv.includes('--frames') ? [0, 90, 360, 700] : [];
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', scope: 'Actual desktop native sidebar Home to task routes. Settled whole viewport and optional deterministic CSS-animation relative frames after canonical readiness; frames are not wall-clock navigation timestamps. Original finite animations are paused and sampled identically; no DOM/style substitution, masks or tolerance.', runtime: { node: process.version, os: 'linux', ...environment }, immutableBefore: immutableInputs(), assetsBefore: assets(), profiles: [], threshold: 0, includeAA: true, masks: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const diff = (a, b, name) => { const x = PNG.sync.read(a), y = PNG.sync.read(b), image = new PNG({ width: x.width, height: x.height }); assert.equal(x.width, y.width); assert.equal(x.height, y.height); return { pixels: pixelmatch(x.data, y.data, image.data, x.width, x.height, { threshold: 0, includeAA: true }), image: store(`${name}-diff.png`, PNG.sync.write(image)) }; };
const measure = page => page.evaluate(() => ({ url: location.href, sourceRoute: window.__gr8r?.S.ui.route ?? null, motion: document.documentElement.dataset.motion, text: document.body.innerText, metrics: [...document.querySelectorAll('.stat .v,[data-metric]')].map(el => ({ text: el.textContent, state: el.dataset.countupState, value: el.dataset.metricValue })), flags: [...document.querySelectorAll('.fx-route,.fx-tab,[data-project-transition]')].map(el => ({ class: el.className, transition: el.dataset.projectTransition })), animations: document.getAnimations().map(animation => ({ name: animation.animationName, state: animation.playState, time: animation.currentTime, timing: animation.effect.getTiming(), frames: animation.effect.getKeyframes(), html: animation.effect.target.outerHTML.slice(0, 600), rect: animation.effect.target.getBoundingClientRect().toJSON() })) }));
let browser, stopSource, stopTarget;
try {
 stopSource = await sourceServer(); stopTarget = await targetServer(); checkSource();
 browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
 for (const mode of selectedModes) for (const route of selectedRoutes) {
  const id = `${mode}-${route}-1440`, prefs = { theme: 'light', accent: 'indigo', side: 'comfortable', density: 'comfortable', motion: mode === 'stored-reduce' ? 'reduce' : mode === 'full-os' ? 'full' : 'system' }, osMotion = ['os-reduce', 'full-os'].includes(mode) ? 'reduce' : 'no-preference', fixture = readJson(`${artifacts}/source-fixture.json`), dataset = createSeedDataset(); Object.assign(fixture.prefs, prefs); Object.assign(dataset.preferences, prefs);
  const sourceOsMotion = mode === 'full-os' ? 'no-preference' : osMotion;
  const profile = { id, route, prefs, osMotion, sourceOsMotion, correction: mode === 'full-os' ? 'DECISIONS QUIRK-03: Target full preserves full motion despite OS reduce. Source unconditional OS override is a known bug; original Source full/no-preference is the canonical named-full behavior reference. Separate raw Source full/OS-reduce metadata is retained.' : null, status: 'running', samples: [], actions: [], fixtures: { source: store(`${id}-source-fixture.json`, Buffer.from(`${JSON.stringify(fixture)}\n`)), target: store(`${id}-target-fixture.json`, Buffer.from(`${JSON.stringify(dataset)}\n`)), seedProvenance } }; report.profiles.push(profile); save();
  const config = { viewport: { width: 1440, height: 1000 }, mobile: false }, a = await newPage(browser, config, fixture), b = await newPage(browser, config, undefined, true, 'http://127.0.0.1:5173'), pending = [], responses = [[], []], errors = [[], []];
  for (const [session, side] of [[a, 0], [b, 1]]) { session.page.setDefaultTimeout(12000); await session.page.emulateMedia({ reducedMotion: side === 0 ? sourceOsMotion : osMotion }); session.page.on('pageerror', error => errors[side].push(String(error))); session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); responses[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); }); }
  await b.context.addInitScript(({ prefs, dataset, key, fixtureSha256 }) => { localStorage.setItem('task8.ui.theme.v1', JSON.stringify(prefs)); localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })); }, { prefs, dataset, key: mockStorageKey(workspaceId), fixtureSha256: seedProvenance.fixtureSha256 });
  const settle = async () => { await readiness(a.page); await ready(b.page); await b.page.waitForFunction(() => ![...document.querySelectorAll('main [role=status]')].some(el => /^Loading /.test(el.textContent.trim()))); await b.page.waitForTimeout(700); for (const { page } of [a, b]) { await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(1, 1); } };
  const capture = async label => { const state = await Promise.all([a.page, b.page].map(measure)), source = await a.page.screenshot({ animations: 'allow', caret: 'hide' }), sourceRepeat = await a.page.screenshot({ animations: 'allow', caret: 'hide' }), target = await b.page.screenshot({ animations: 'allow', caret: 'hide' }), targetRepeat = await b.page.screenshot({ animations: 'allow', caret: 'hide' }), name = `${id}-${label}`; profile.samples.push({ label, state, source: store(`${name}-source.png`, source), target: store(`${name}-target.png`, target), sourceRepeat: store(`${name}-source-repeat.png`, sourceRepeat), targetRepeat: store(`${name}-target-repeat.png`, targetRepeat), comparison: diff(source, target, name), repeats: [diff(source, sourceRepeat, `${name}-source-repeat`), diff(target, targetRepeat, `${name}-target-repeat`)] }); save(); };
  try {
   await a.page.goto('http://127.0.0.1:4173/#home'); await a.page.waitForFunction(() => !!window.__gr8r); await b.page.goto(`http://127.0.0.1:5173/w/${workspaceId}/home`); await settle(); profile.coldState = await Promise.all([a.page, b.page].map(measure)); save();
   const label = { mytasks: 'My Tasks', tasks: 'Tasks', calendar: 'Calendar', timeline: 'Timeline', home: 'Home', overview: 'Overview', projects: 'Projects' }[route];
   if (route === 'home') { await a.page.locator('.side [data-a="go"][data-r="projects"]').first().click(); await b.page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Projects', exact: true }).click(); await settle(); }
   const canonicalPath = `/w/${workspaceId}/${route === 'mytasks' ? 'my-tasks' : route}`;
   await a.page.locator(`.side [data-a="go"][data-r="${route}"]`).first().click(); await b.page.getByRole('navigation', { name: 'Main', exact: true }).locator(`a[href="${canonicalPath}"]`).click(); profile.actions.push({ kind: 'actual sidebar mouse entry', source: route, target: label, canonicalPath, targetUrl: b.page.url() }); save(); await settle(); await Promise.all(pending); await capture('settled');
   for (const time of frames) { await Promise.all([a.page, b.page].map(page => page.evaluate(time => { for (const animation of document.getAnimations()) if (animation.effect.getTiming().iterations !== Infinity) { animation.pause(); animation.currentTime = time; } }, time))); await b.page.waitForTimeout(50); await capture(`css-relative-${time}ms`); }
   if (mode === 'full-os') {
    const raw = await newPage(browser, config, fixture);
    try {
     await raw.page.emulateMedia({ reducedMotion: 'reduce' }); await raw.page.goto('http://127.0.0.1:4173/#home'); await raw.page.waitForFunction(() => !!window.__gr8r); await readiness(raw.page);
     if (route === 'home') { await raw.page.locator('.side [data-a="go"][data-r="projects"]').first().click(); await readiness(raw.page); }
     await raw.page.locator(`.side [data-a="go"][data-r="${route}"]`).first().click(); await readiness(raw.page);
     profile.rawSourceFullOsQuirk = await measure(raw.page); save();
     assert.ok(profile.rawSourceFullOsQuirk.animations.some(animation => animation.name === 'fadeOnly'));
    } finally { await raw.context.close(); }
   }
   profile.fonts = { responses, loaded: await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight }))))) }; profile.errors = errors; save();
   const locked = readJson(`${artifacts}/font-assets.json`).assets; for (const side of responses) { assert.ok(side.length >= 2); for (const font of side) { assert.equal(font.status, 200); assert.ok(locked.some(asset => asset.sha256 === font.sha256)); } } for (const faces of profile.fonts.loaded) for (const spec of ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400']) assert.ok(faces.some(face => `${face.family.replaceAll('"', '')}:${face.weight}` === spec)); assert.deepEqual(errors, [[], []]);
   for (const sample of profile.samples) { assert.equal(sample.comparison.pixels, 0, `${id}-${sample.label}`); for (const repeat of sample.repeats) assert.equal(repeat.pixels, 0); } profile.status = 'passed';
  } catch (error) { profile.status = 'failed'; profile.error = String(error.stack); profile.errors = errors; profile.fonts ??= { responses }; }
  save(); console.log(`${id}: ${profile.status} ${profile.samples.map(sample => `${sample.label}=${sample.comparison.pixels}`).join(',')}`); await a.context.close(); await b.context.close();
 }
 report.immutableAfter = immutableInputs(); report.assetsAfter = assets(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.assetsBefore, report.assetsAfter); checkSource(); report.status = report.profiles.every(profile => profile.status === 'passed') ? 'passed' : 'failed'; save(); if (report.status !== 'passed') process.exitCode = 1;
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); await stopTarget?.(); await stopSource?.(); }
