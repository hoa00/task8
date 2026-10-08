import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, sha256, readJson } from '../reference/source-check.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { sourceTaskControls, sourceQueryFixtures } from './source-sample.mjs';
export async function ready(page) { await page.evaluate(async () => { for (const family of ['Geist', 'Geist Mono']) for (const weight of [400, 500, 600]) await document.fonts.load(`${weight} 13.5px "${family}"`); await document.fonts.ready; document.body.getBoundingClientRect(); await Promise.all(document.getAnimations().filter(animation => animation.playState !== 'idle' && animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }); }
export async function targetServer() {
  const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: path.resolve('apps/web'), stdio: 'pipe' }); let logs = ''; server.stdout.on('data', value => logs += value); server.stderr.on('data', value => logs += value);
  const stop = async () => { if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited; } };
  try { for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173/task-fields.html')).ok) return stop; } catch { /* starting */ } if (server.exitCode !== null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 100)); } throw Error('Target startup timed out'); } catch (error) { await stop(); throw error; }
}
async function verify() {
 const evidence = path.resolve('docs/poc/evidence/WU-08'), output = path.resolve('test-results/WU-08'); fs.mkdirSync(output, { recursive: true });
 const hashes = () => Object.fromEntries(['baseline-manifest.json', 'font-assets.json', 'source-fixture.json', 'source-lock.json'].map(name => [name, sha256(fs.readFileSync(`${artifacts}/${name}`))])); const before = hashes(); checkSource();
 const stopSource = await sourceServer(), stopTarget = await targetServer(); let browser;
 const report = { sourceSha: '904205c626918ee96054eb35495c394a60c0c601', runtime: { node: process.version, os: os.platform(), ...environment }, samples: [], immutableBefore: before, threshold: 0, includeAA: true, maxDiffPixels: 0, masks: [], provenance: 'Source-only actual locked viewToolbar/popHtml/FIELDS/select enhancer and original helpers/CSS/fonts; independent QA state, original source roots retained. Target is controlled React toolbar.', limitations: ['Scoped Linux samples do not establish Darwin173 whole-page parity.', 'Programmatic state setup is separate from real keyboard/mouse probes.', 'No full task list/board/table or named saved-view persistence UI in WU-08.'] };
 const compare = (a, b, name) => { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); const diff = new PNG({ width: x.width, height: x.height }); const pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true }); if (pixels) fs.writeFileSync(`${output}/${name}-diff.png`, PNG.sync.write(diff)); return pixels; };
 const cases = [{ id: 'default' }, { id: 'chips', filtered: true }, { id: 'filter-empty', menu: 'filter' }, { id: 'filter-rows', menu: 'filter', filtered: true }, { id: 'filter-expanded', menu: 'filter', filtered: true, expanded: true }, { id: 'sort', menu: 'sort' }, { id: 'group', menu: 'group' }, { id: 'columns', menu: 'cols' }];
 const matrix = [...['light', 'dark'].flatMap(theme => cases.map(sample => ({ ...sample, theme, width: 1000, height: 700 }))), ...['default', 'chips', 'filter-rows'].map(id => ({ ...cases.find(sample => sample.id === id), theme: 'light', width: 390, height: 844 })), ...[639, 640, 641].map(width => ({ id: 'default', theme: 'light', width, height: 844 }))];
 try {
  browser = await chromium.launch({ headless: true }); report.runtime.browser = browser.version(); const fixture = readJson(`${artifacts}/source-fixture.json`);
  for (const sample of matrix) {
   const id = `${sample.id}-${sample.theme}-${sample.width}`; const a = await newPage(browser, { viewport: { width: sample.width, height: sample.height }, mobile: sample.width <= 640 }, fixture); const b = await newPage(browser, { viewport: { width: sample.width, height: sample.height }, mobile: sample.width <= 640 }, undefined, true, 'http://127.0.0.1:5173');
   await b.context.addInitScript(theme => localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme, accent: 'indigo', side: 'comfortable', density: 'comfortable', motion: 'system' })), sample.theme);
   await a.page.goto('http://127.0.0.1:4173'); await sourcePreferences(a.page, { theme: sample.theme, accent: 'indigo', motion: 'system' }); const sourceGeometry = await sourceTaskControls(a.page, sample);
   if (id === 'default-light-1000') { const actual = await sourceQueryFixtures(a.page); assert.deepEqual(actual, { dueGroups: [['overdue', ['QA-1']], ['today', ['QA-2']], ['week', ['QA-2', 'QA-3']], ['later', ['QA-4']], ['nodate', ['QA-5']]], unassigned: ['QA-1', 'QA-2', 'QA-3', 'QA-4', 'QA-5', 'QA-6'], dueAsc: ['QA-2', 'QA-1', 'QA-3'], dueDesc: ['QA-3', 'QA-2', 'QA-1'], manualTies: ['QA-3', 'QA-2', 'QA-1'] }); report.sourceDecisionFixtures = { actual, canonical: { dueAsc: ['QA-1', 'QA-2', 'QA-3'], dueDesc: ['QA-3', 'QA-1', 'QA-2'], manualTies: ['QA-1', 'QA-2', 'QA-3'] }, decision: 'API_CONTRACT285 stable ascending ID tie-breaker intentionally differs from source stable input order. DATA-08 due/null semantics unchanged.' }; }
   const config = { query: { filters: sample.filtered ? [{ field: 'status', op: 'is', values: ['progress'] }, { field: 'assignee', op: 'not', values: [null] }] : [] } };
   await b.page.goto(`http://127.0.0.1:5173/task-fields.html?visual=1&view=${encodeURIComponent(JSON.stringify(config))}`); await b.page.waitForSelector('#task-toolbar-sample [role=toolbar]');
   if (sample.menu) { const names = { filter: /^Filter/, sort: /^Sort:/, group: /^Group:/, cols: /^Columns$/ }; await b.page.locator('[role=toolbar]').getByRole('button', { name: names[sample.menu] }).evaluate(element => element.click()); if (sample.expanded) await b.page.getByRole('button', { name: 'Filter values' }).first().evaluate(element => element.click()); }
   for (const page of [a.page, b.page]) { await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(sample.width - 1, sample.height - 1); await ready(page); }
   const targetGeometry = await b.page.evaluate(() => ({ toolbar: document.querySelector('#task-toolbar-sample').getBoundingClientRect().toJSON(), popover: document.querySelector('[data-overlay-kind=popover]')?.getBoundingClientRect().toJSON() ?? null }));
   const height = Math.ceil(Math.max(sourceGeometry.toolbar.bottom, sourceGeometry.popover?.bottom ?? 0) + (sample.menu ? 24 : 0)); const clip = { x: 0, y: 0, width: sample.width, height };
   for (const page of [a.page, b.page]) { await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }); await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }); }
   const source = await a.page.screenshot({ clip, animations: 'disabled', caret: 'hide' }), sourceRepeat = await a.page.screenshot({ clip, animations: 'disabled', caret: 'hide' }), target = await b.page.screenshot({ clip, animations: 'disabled', caret: 'hide' }), targetRepeat = await b.page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
   fs.writeFileSync(`${output}/${id}-source.png`, source); fs.writeFileSync(`${output}/${id}-target.png`, target); const changedPixels = compare(source, target, id), repeatabilityPixels = compare(source, sourceRepeat, `${id}-source-repeat`) + compare(target, targetRepeat, `${id}-target-repeat`);
   report.samples.push({ id, clip, changedPixels, repeatabilityPixels, sourceGeometry, targetGeometry, sourceSha256: sha256(source), targetSha256: sha256(target) }); console.log(`${id}: ${changedPixels} pixels, repeat ${repeatabilityPixels}`); await a.context.close(); await b.context.close();
  }
  report.immutableAfter = hashes(); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource(); report.status = report.samples.some(sample => sample.changedPixels || sample.repeatabilityPixels) ? 'failed' : 'passed'; fs.writeFileSync(`${evidence}/${process.argv.includes('audit') ? 'audit' : 'visual-verification'}.json`, JSON.stringify(report, null, 2) + '\n'); assert.equal(report.status, 'passed', 'Full matrix classified; raster failures remain');
 } catch (error) { report.error = String(error.stack); fs.writeFileSync(`${output}/failed-visual.json`, JSON.stringify(report, null, 2) + '\n'); throw error; }
 finally { await browser?.close(); await stopTarget(); await stopSource(); }
}
if (process.argv[1] === new URL(import.meta.url).pathname) await verify();
