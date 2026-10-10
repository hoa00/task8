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
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const matrix = [1440, 390].flatMap(width => ['normal', 'stored-reduce', 'os-reduce'].map(mode => ({ width, mode, id: `${mode}-${width}` }))).filter(row => !only || only.split(',').includes(row.id));
const report = { status: 'running', scope: 'Home startup versus actual native entry, root/hash normalization, refresh and canonical Back/Forward. Source go does not update browser history; the matching Source navigation is recorded separately.', runtime: { node: process.version, os: 'linux', ...environment }, immutableBefore: immutableInputs(), assetsBefore: assets(), profiles: [], threshold: 0, includeAA: true, masks: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const diff = (a, b, name) => { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const image = new PNG({ width: x.width, height: x.height }); return { pixels: pixelmatch(x.data, y.data, image.data, x.width, x.height, { threshold: 0, includeAA: true }), image: store(`${name}-diff.png`, PNG.sync.write(image)) }; };
const measure = page => page.evaluate(() => ({ url: location.href, route: window.__gr8r?.S.ui.route ?? null, text: document.body.innerText, motion: document.documentElement.dataset.motion, animations: document.getAnimations().map(animation => ({ name: animation.animationName ?? null, playState: animation.playState, time: animation.currentTime, timing: animation.effect?.getTiming(), frames: animation.effect?.getKeyframes(), target: animation.effect?.target?.outerHTML?.slice(0, 300) })), nestedOwners: [...document.querySelectorAll('.grid2 > * > *,.dashboard-grid > * > *')].map(el => { const css = getComputedStyle(el); return { html: el.outerHTML.slice(0, 500), rect: el.getBoundingClientRect().toJSON(), name: css.animationName, duration: css.animationDuration, delay: css.animationDelay, fill: css.animationFillMode, easing: css.animationTimingFunction, animations: el.getAnimations().map(animation => ({ name: animation.animationName, playState: animation.playState, timing: animation.effect.getTiming() })) }; }), flags: [...document.querySelectorAll('.fx-route,.fx-tab,[data-project-transition]')].map(el => ({ class: el.className, transition: el.dataset.projectTransition })) }));
async function settle(a, b) { await readiness(a.page); await ready(b.page); await b.page.waitForFunction(() => ![...document.querySelectorAll('main [role=status]')].some(el => /^Loading /.test(el.textContent.trim()))); await b.page.waitForTimeout(300); for (const { page } of [a, b]) { await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(1, 1); } }
let browser, stopSource, stopTarget;
try {
 stopSource = await sourceServer(); stopTarget = await targetServer(); checkSource();
 browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
 for (const { width, mode } of matrix) {
  const id = `${mode}-${width}`, motion = mode === 'stored-reduce' ? 'reduce' : 'system', osMotion = mode === 'os-reduce' ? 'reduce' : 'no-preference';
  const prefs = { theme: 'light', accent: 'indigo', side: 'comfortable', density: 'comfortable', motion }, fixture = readJson(`${artifacts}/source-fixture.json`), dataset = createSeedDataset(); Object.assign(fixture.prefs, prefs); Object.assign(dataset.preferences, prefs);
  const profile = { id, width, prefs, osMotion, status: 'running', samples: [], actions: [], fixtures: { source: store(`${id}-source-fixture.json`, Buffer.from(`${JSON.stringify(fixture)}\n`)), target: store(`${id}-target-fixture.json`, Buffer.from(`${JSON.stringify(dataset)}\n`)), seedProvenance } }; report.profiles.push(profile); save();
  const config = { viewport: { width, height: width === 390 ? 844 : 1000 }, mobile: width === 390 }, a = await newPage(browser, config, fixture), b = await newPage(browser, config, undefined, true, 'http://127.0.0.1:5173');
  const fonts = [[], []], errors = [[], []], pending = [];
  for (const [session, side] of [[a, 0], [b, 1]]) { session.page.setDefaultTimeout(12000); await session.page.emulateMedia({ reducedMotion: osMotion }); session.page.on('pageerror', error => errors[side].push(String(error))); session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); fonts[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); }); }
  await b.context.addInitScript(({ prefs, dataset, key, fixtureSha256 }) => { localStorage.setItem('task8.ui.theme.v1', JSON.stringify(prefs)); localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })); }, { prefs, dataset, key: mockStorageKey(workspaceId), fixtureSha256: seedProvenance.fixtureSha256 });
  const capture = async label => {
   await settle(a, b); await Promise.all(pending);
   const state = await Promise.all([a.page, b.page].map(measure));
   const source = await a.page.screenshot({ animations: 'allow', caret: 'hide' }), sourceRepeat = await a.page.screenshot({ animations: 'allow', caret: 'hide' }), target = await b.page.screenshot({ animations: 'allow', caret: 'hide' }), targetRepeat = await b.page.screenshot({ animations: 'allow', caret: 'hide' }); const name = `${id}-${label}`;
   const sample = { label, state, source: store(`${name}-source.png`, source), target: store(`${name}-target.png`, target), sourceRepeat: store(`${name}-source-repeat.png`, sourceRepeat), targetRepeat: store(`${name}-target-repeat.png`, targetRepeat), comparison: diff(source, target, name), repeats: [diff(source, sourceRepeat, `${name}-source-repeat`), diff(target, targetRepeat, `${name}-target-repeat`)] }; profile.samples.push(sample); save();
  };
  const clickRoute = async route => {
   const source = a.page.locator(`${width === 390 ? '.bottomnav' : '.side'} [data-a="go"][data-r="${route}"]`).first(); const target = b.page.getByRole('navigation', { name: width === 390 ? 'Primary' : 'Main', exact: true }).getByRole('link', { name: route === 'home' ? 'Home' : 'Projects', exact: true });
   await source.click(); await target.click(); await a.page.waitForFunction(route => window.__gr8r.S.ui.route === route, route); await b.page.waitForURL(`**/${route}`); profile.actions.push({ kind: 'native mouse', source: await source.count() ? `${route} sidebar/bottomnav` : route, target: route, url: b.page.url() }); save();
  };
  try {
   for (const [label, sourceUrl, targetUrl] of [['canonical-cold', '/', `/w/${workspaceId}/home`], ['root-cold', '/', '/'], ['hash-cold', '/#home', '/#home']]) { await a.page.goto(`http://127.0.0.1:4173${sourceUrl}`); await a.page.waitForFunction(() => !!window.__gr8r); await b.page.goto(`http://127.0.0.1:5173${targetUrl}`); await b.page.waitForSelector('[data-dashboard-ready]'); await capture(label); assert.equal(profile.samples.at(-1).state[0].animations.length, 0); assert.equal(profile.samples.at(-1).state[1].animations.length, 0); }
   await clickRoute('projects'); await settle(a, b); profile.actions.push({ kind: 'transit state', state: await Promise.all([a.page, b.page].map(measure)) }); save();
   await clickRoute('home'); await capture('native-return'); for (const state of profile.samples.at(-1).state) assert.ok(state.animations.length > 0, 'Native entrance retained');
   await b.page.goBack(); await b.page.waitForURL('**/projects'); await a.page.locator(`${width === 390 ? '.bottomnav' : '.side'} [data-a="go"][data-r="projects"]`).first().click(); profile.actions.push({ kind: 'canonical browser Back; Source actual Projects click because original go has no browser history', targetUrl: b.page.url() }); save(); await settle(a, b);
   await b.page.goForward(); await b.page.waitForURL('**/home'); await a.page.locator(`${width === 390 ? '.bottomnav' : '.side'} [data-a="go"][data-r="home"]`).first().click(); profile.actions.push({ kind: 'canonical browser Forward; Source actual Home click', targetUrl: b.page.url() }); save(); await capture('forward-return');
   await a.page.reload(); await b.page.reload(); await a.page.waitForFunction(() => !!window.__gr8r); await b.page.waitForSelector('[data-dashboard-ready]'); profile.actions.push({ kind: 'actual reload both; startup Home' }); await capture('refresh-cold');
   profile.fonts = { responses: fonts, loaded: await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight }))))) }; profile.errors = errors; save();
   const lockedFonts = readJson(`${artifacts}/font-assets.json`).assets; for (const side of fonts) { assert.ok(side.length >= 2); for (const font of side) { assert.equal(font.status, 200); assert.ok(lockedFonts.some(asset => asset.sha256 === font.sha256)); } } for (const faces of profile.fonts.loaded) for (const spec of ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400']) assert.ok(faces.some(face => `${face.family.replaceAll('"', '')}:${face.weight}` === spec)); assert.deepEqual(errors, [[], []]);
   for (const sample of profile.samples) { assert.equal(sample.comparison.pixels, 0, `${id}-${sample.label} whole viewport`); for (const repeat of sample.repeats) assert.equal(repeat.pixels, 0); } profile.status = 'passed';
  } catch (error) { profile.status = 'failed'; profile.error = String(error.stack); profile.errors = errors; profile.fonts ??= { responses: fonts }; }
  save(); console.log(`${id}: ${profile.status} ${profile.samples.map(sample => `${sample.label}=${sample.comparison.pixels}`).join(',')}`); await a.context.close(); await b.context.close();
 }
 report.selectedMatrix = matrix; report.immutableAfter = immutableInputs(); report.assetsAfter = assets(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.assetsBefore, report.assetsAfter); checkSource(); report.status = report.profiles.length === matrix.length && report.profiles.every(profile => profile.status === 'passed') ? 'passed' : 'failed'; save(); if (report.status !== 'passed') process.exitCode = 1;
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); await stopTarget?.(); await stopSource?.(); }
