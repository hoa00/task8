import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { shellBase } from './matrix.mjs';
import { applyCanonicalProjection } from './canonical-projection.mjs';
import { partitionPixels } from './qualified-regions.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { readiness } from '../reference/source-driver.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, readJson, sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';

const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique bridge required');
const ids = ['SC-13-base', 'SC-15-base', 'SC-17-base', 'PR-01-overview', 'PR-08-activity', 'SE-members', 'SE-teams'];
const base = shellBase.filter(row => ids.includes(row.id) || row.route === 'settings' && ['members', 'teams'].includes(row.params?.sec));
assert.equal(base.length, 7);
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const matrix = [1440, 390].flatMap(width => base.map(row => ({ ...row, width, id: `${row.id}-${width}` }))).filter(row => !only || only.some(id => row.id.includes(id)));
assert.ok(matrix.length);
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`); fs.copyFileSync('tests/visual/m2/canonical-projection.mjs', `${output}/executed-projection.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', scope: 'Finite same-startup raw Source input versus contract-projected Source input. Original Source renderer, templates, CSS and fixture locks remain immutable. Exact field/record regions explain changed pixels; projected pair equality in the separate current Target matrix is qualified input layout evidence, not raw original parity.', runtime: { node: process.version, os: 'linux', ...environment }, matrix, samples: [], assetsBefore: assets(), immutableBefore: immutableInputs() };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const store = (name, bytes) => { const file = `${output}/${name}`; fs.writeFileSync(file, bytes, { flag: 'wx' }); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const compare = (a, b, name) => { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const image = new PNG({ width: x.width, height: x.height }); return { pixels: pixelmatch(x.data, y.data, image.data, x.width, x.height, { threshold: 0, includeAA: true }), image: store(`${name}-diff.png`, PNG.sync.write(image)) }; };
const regions = (page, row) => page.evaluate(async row => {
 const field = el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON(), style: Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','padding','border'].map(key => [key, getComputedStyle(el)[key]])) });
 if (row.params?.sec === 'members') return ['m6', 'm7'].map(id => { const el = document.querySelector(`.mini[data-ctx="member"][data-id="${id}"]`); if (!el) throw Error(`Missing Settings member identity ${id}`); return { id, field: 'Settings identity/role row; this view renders no project count, so privacy projection must have no visible effect', ...field(el) }; });
 if (row.route === 'members') return ['m6', 'm7'].map(id => { const el = document.querySelector(`tr[data-ctx="member"][data-id="${id}"] td:nth-child(4)`); if (!el) throw Error(`Missing member count ${id}`); return { id, field: 'authorized active project count', ...field(el) }; });
 if (row.route === 'teams' || row.params?.sec === 'teams') { const el = document.querySelector('.pcard[data-r="team"][data-id="eng"] .foot > span:nth-child(2)'); if (!el) throw Error('Missing Engineering project count'); return [{ id: 'eng', field: 'authorized project count', ...field(el) }]; }
 const { actHtml } = await import('/src/components/task-list.js');
 const data = window.__gr8r.S.data;
 const activities = data.activity.map(record => ({ ...record, kind: 'activity' }));
 if (row.route === 'project' && row.params?.tab === 'activity') for (const comment of data.comments) {
  const task = data.tasks.find(task => task.id === comment.task);
  if (task?.project === row.params.id) activities.push({ id: comment.id, kind: 'comment-derived', by: comment.by, verb: 'commented on', task: comment.task, project: row.params.id, at: comment.at, extra: '' });
 }
 const owner = row.route === 'activity' ? '.page' : '.pbody';
 return [...document.querySelectorAll(`${owner} .fitem,${owner} .day-h`)].map(el => {
  if (el.classList.contains('day-h')) return { id: el.textContent, field: 'activity date-group header order', ...field(el) };
  const matches = activities.filter(activity => { const template = document.createElement('template'); template.innerHTML = actHtml(activity, row.route === 'activity' ? { proj: true } : {}); return template.content.firstElementChild.textContent === el.textContent; });
  if (matches.length !== 1) throw Error(`Activity record mapping ambiguous: ${matches.length}`);
  return { id: matches[0].id, kind: matches[0].kind, field: 'actual activity record order/content selection', ...field(el) };
 });
}, row);
let browser, stopSource;
try {
 stopSource = await sourceServer(); checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
 for (const row of matrix) {
  const sample = { id: row.id, status: 'running', sides: [] }; report.samples.push(sample); save();
  const images = [], contexts = [];
  try {
   for (const side of ['raw', 'projected']) {
    const fixture = readJson(`${artifacts}/source-fixture.json`); Object.assign(fixture.prefs, { theme: 'light', accent: 'indigo', density: 'comfortable', side: 'comfortable', motion: 'system' });
    const changes = side === 'projected' ? applyCanonicalProjection(fixture, row) : [];
    const session = await newPage(browser, { viewport: { width: row.width, height: row.width === 390 ? 844 : 1000 }, mobile: row.width === 390 }, fixture); contexts.push(session.context);
    const fonts = [], errors = [], pending = []; session.page.on('pageerror', error => errors.push(String(error))); session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); fonts.push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
    await session.page.emulateMedia({ reducedMotion: 'reduce' });
    const parameterized = Object.keys(row.params ?? {}).length > 0;
    await session.page.goto(`http://127.0.0.1:4173${parameterized ? '' : `/#${row.route}`}`); await session.page.waitForFunction(() => !!window.__gr8r);
    if (parameterized) await session.page.evaluate(row => { const { S, render } = window.__gr8r; S.ui.route = row.route; S.ui.params = row.params; render(); }, row);
    await readiness(session.page); await session.page.evaluate(() => document.activeElement?.blur()); await session.page.mouse.move(row.width - 1, row.width === 390 ? 843 : 999); await Promise.all(pending);
    const measured = await regions(session.page, row), bytes = await session.page.screenshot({ animations: 'allow', caret: 'hide' }), repeat = await session.page.screenshot({ animations: 'allow', caret: 'hide' }); images.push(bytes);
    const loaded = await session.page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight })));
    sample.sides.push({ side, fixture: store(`${row.id}-${side}-fixture.json`, Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`)), changes, regions: measured, image: store(`${row.id}-${side}.png`, bytes), repeat: store(`${row.id}-${side}-repeat.png`, repeat), repeatComparison: compare(bytes, repeat, `${row.id}-${side}-repeat`), fonts: { responses: fonts, loaded }, errors, actual: await session.page.evaluate(() => ({ prefs: window.__gr8r.S.prefs, activityOrder: window.__gr8r.S.data.activity.map(row => row.id) })) }); save();
    for (const font of fonts) { assert.equal(font.status, 200); assert.ok(readJson(`${artifacts}/font-assets.json`).assets.some(asset => asset.sha256 === font.sha256)); } assert.equal(fonts.length, 2); assert.equal(errors.length, 0);
    for (const spec of ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400']) assert.ok(loaded.some(face => `${face.family.replaceAll('"', '')}:${face.weight}` === spec));
   }
   const bounds = sample.sides.flatMap(side => side.regions.map(record => record.rect)); assert.ok(bounds.length);
   sample.comparison = compare(images[0], images[1], row.id); sample.partition = partitionPixels(PNG.sync.read(images[0]), PNG.sync.read(images[1]), { bounds });
   assert.equal(sample.partition.total, sample.comparison.pixels); assert.equal(sample.partition.outside, 0); assert.ok(sample.sides.every(side => side.repeatComparison.pixels === 0)); sample.status = 'passed-qualified-input-correction';
  } catch (error) { sample.status = 'failed'; sample.error = String(error.stack); }
  save(); console.log(`${sample.id}: ${sample.status} whole=${sample.comparison?.pixels ?? 'none'} outside=${sample.partition?.outside ?? 'none'}`); for (const context of contexts) await context.close();
 }
 report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource(); report.status = report.samples.every(row => row.status === 'passed-qualified-input-correction') ? 'passed' : 'failed'; save(); if (report.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await stopSource?.(); }
