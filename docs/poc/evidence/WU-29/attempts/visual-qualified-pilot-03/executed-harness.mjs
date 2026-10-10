import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { shellMatrix, targetPath, workspaceId } from './matrix.mjs';
import { qualifiedRegions, partitionPixels } from './qualified-regions.mjs';
import { extraMatrix } from './extra-matrix.mjs';
import { projectExtraFixture, extraControls } from './extra-controls.mjs';
import { applyCanonicalProjection } from './canonical-projection.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { setupScenario, readiness } from '../reference/source-driver.mjs';
import { artifacts, readJson, sha256, checkSource } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { createSeedDataset, seedProvenance } from '../../../apps/web/src/data/mock/seed.ts';
import { mockStorageKey } from '../../../apps/web/src/data/mock/persistence.ts';

const attempt = process.argv[2];
const output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
fs.copyFileSync('tests/visual/m2/matrix.mjs', `${output}/executed-matrix.mjs`);
fs.copyFileSync('tests/visual/m2/qualified-regions.mjs', `${output}/executed-qualified-regions.mjs`);
fs.copyFileSync('tests/visual/m2/extra-matrix.mjs', `${output}/executed-extra-matrix.mjs`);
fs.copyFileSync('tests/visual/m2/extra-controls.mjs', `${output}/executed-extra-controls.mjs`);
fs.copyFileSync('tests/visual/m2/canonical-projection.mjs', `${output}/executed-canonical-projection.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const normal = process.argv.includes('--normal');
const natural = process.argv.includes('--natural');
const startup = process.argv.includes('--startup');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const matrix = (process.argv.includes('--extra') ? extraMatrix : shellMatrix).filter(row => !only || only.split(',').some(id => row.id.includes(id)));
assert.ok(matrix.length, 'Selected matrix must not be empty');
const report = { status: 'running', scope: 'Full viewport shell/project/settings/modifiers on current production Mock; Linux source-only matching capture, immutable Darwin173. BOTH --disable-partial-raster and explicitly reported OS motion. Source CAPTURE settled render protocol; no stylesheet/template mutations, tolerance, masks, Target goldens or picked pairs.', runtime: { node: process.version, os: 'linux', ...environment, reducedMotion: normal ? 'no-preference' : 'reduce' }, immutableBefore: immutableInputs(), assetsBefore: assets(), matrix, samples: [], threshold: 0, includeAA: true, masks: [] };
report.sourceLifecycle = startup ? 'Matched startup: original Source boot hash for supported parameterless aliases; parameterized routes use explicitly recorded QA transient route/params plus original render without go/fx. Target direct-cold canonical route. Native go/navigation is tested separately.' : natural ? 'Original first route lifecycle: initial Home kept; other configured routes use original go once after setting transient controls; no extra render. Separate from CAPTURE rerender cohort.' : 'CAPTURE setupScenario and additional settled render; source flag consumption recorded separately from Target first-cold lifecycle.';
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
function compare(a, b, name) {
  const x = PNG.sync.read(a), y = PNG.sync.read(b);
  assert.equal(x.width, y.width); assert.equal(x.height, y.height);
  const diff = new PNG({ width: x.width, height: x.height });
  const pixels = pixelmatch(x.data, y.data, diff.data, x.width, x.height, { threshold: 0, includeAA: true });
  return { pixels, image: store(`${name}-diff.png`, PNG.sync.write(diff)) };
}
async function settled(page) {
  await ready(page);
  await page.waitForFunction(() => ![...document.querySelectorAll('main [role=status],#main-content [role=status]')].some(el => /^Loading /.test(el.textContent.trim())));
  let last = '', stable = 0;
  for (let index = 0; index < 20 && stable < 3; index++) {
    await page.waitForTimeout(100);
    const current = await page.evaluate(() => JSON.stringify({ text: document.body.innerText, boxes: [...document.querySelectorAll('h1,h2,main,.page,.pbody')].map(el => el.getBoundingClientRect().toJSON()) }));
    stable = current === last ? stable + 1 : 0; last = current;
  }
  assert.ok(stable >= 3, 'Unsettled text or geometry');
  await page.evaluate(() => { document.activeElement?.blur(); for (const animation of document.getAnimations()) if (animation.effect?.getTiming().iterations === Infinity) { animation.pause(); animation.currentTime = 0; } });
}
let browser, stopSource, stopTarget;
try {
  stopSource = await sourceServer(); stopTarget = await targetServer();
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] });
  report.runtime.browser = browser.version(); const cdp = await browser.newBrowserCDPSession(); report.runtime.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; await cdp.detach();
  for (const row of matrix) {
    const sample = { id: row.id, family: row.family, status: 'running', setup: row, captures: [] };
    report.samples.push(sample); save();
    const height = row.height ?? (row.width <= 640 ? 844 : 1000), config = { viewport: { width: row.width, height }, mobile: row.width <= 640, colorScheme: row.colorScheme ?? 'light' };
    sample.configuration = config;
    const fixture = readJson(`${artifacts}/source-fixture.json`), dataset = createSeedDataset();
    sample.extraFixture = projectExtraFixture(fixture, dataset, row);
    sample.sourceInputProjection = process.argv.includes('--canonical-projection') ? applyCanonicalProjection(fixture, row) : [];
    const prefs = { theme: 'light', accent: 'indigo', side: 'comfortable', density: 'comfortable', motion: 'system', ...row.prefs };
    Object.assign(fixture.prefs, prefs);
    Object.assign(dataset.preferences, prefs);
    sample.fixtures = { source: store(`${row.id}-source-fixture.json`, Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`)), target: store(`${row.id}-target-fixture.json`, Buffer.from(`${JSON.stringify(dataset, null, 2)}\n`)), seedProvenance };
    const a = await newPage(browser, config, fixture), b = await newPage(browser, config, undefined, true, 'http://127.0.0.1:5173');
    const responses = [[], []], pending = [], errors = [[], []];
    for (const [session, side] of [[a, 0], [b, 1]]) {
      session.page.setDefaultTimeout(12000);
      session.page.on('pageerror', error => errors[side].push(String(error)));
      session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); responses[side].push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
      await session.page.emulateMedia({ reducedMotion: report.runtime.reducedMotion });
    }
    await b.context.addInitScript(({ prefs, dataset, key, fixtureSha256, collapsed }) => { localStorage.setItem('task8.ui.theme.v1', JSON.stringify(prefs)); if (collapsed) localStorage.setItem('task8.ui.shell.v1', 'collapsed'); localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, fixtureSha256, dataset })); }, { prefs, dataset, key: mockStorageKey(workspaceId), fixtureSha256: seedProvenance.fixtureSha256, collapsed: !!row.collapsed });
    try {
      const parameterized = Object.keys(row.params ?? {}).length > 0;
      await a.page.goto(`http://127.0.0.1:4173${startup && !parameterized ? `/#${row.route}` : ''}`); await a.page.waitForFunction(() => !!window.__gr8r);
      sample.sourceTrigger = startup ? parameterized ? 'QA transient params + original render; no go/fx, not a supported Source canonical startup URL' : `Actual original startup #${row.route}` : natural ? 'Original initial Home or first go' : 'CAPTURE settled rerender';
      if (startup) {
        if (parameterized || row.ui || row.taskMode) await a.page.evaluate(async row => {
          const { S, render } = window.__gr8r;
          S.ui.route = row.route; S.ui.params = row.params ?? {};
          Object.assign(S.ui, row.ui ?? {});
          if (row.taskMode) (await import('/src/shell/view-engine.js')).viewOf('tasks').mode = row.taskMode;
          render();
        }, row);
        await readiness(a.page);
      } else if (natural) {
        if (row.route !== 'home' || row.ui || row.taskMode) await a.page.evaluate(async row => {
          const { S, go } = window.__gr8r;
          Object.assign(S.ui, row.ui ?? {});
          if (row.taskMode) (await import('/src/shell/view-engine.js')).viewOf('tasks').mode = row.taskMode;
          go(row.route, row.params ?? {});
        }, row);
        await readiness(a.page);
      } else {
        await setupScenario(a.page, row); await readiness(a.page);
        await a.page.evaluate(() => window.__gr8r.render()); await readiness(a.page);
      }
      let path = targetPath(row);
      if (row.targetMode) path += `?mode=${row.targetMode}`;
      await b.page.goto(`http://127.0.0.1:5173${path}`);
      await b.page.waitForSelector('.shell-layout'); await settled(b.page);
      if (row.catalogueMode) await b.page.getByRole('radio', { name: row.catalogueMode, exact: true }).click();
      if (row.filesList) { await b.page.getByRole('button', { name: 'list view', exact: true }).click(); sample.targetControl = 'Native list view button'; }
      if (row.myCalendar) await b.page.getByRole('radio', { name: 'Calendar', exact: true }).click();
      if (row.week) { await b.page.getByRole('radio', { name: 'Week', exact: true }).press('Space'); sample.targetControl = 'Native keyboard Space on Week radio, preserving Source mobile pointer interception quirk'; }
      sample.extraActions = await extraControls(a.page, b.page, row);
      await Promise.all([a.page, b.page].map(settled)); await Promise.all(pending);
      sample.fonts = { responses, loaded: await Promise.all([a.page, b.page].map(page => page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight, status: face.status }))))) }; save();
      const fontAssets = readJson(`${artifacts}/font-assets.json`).assets;
      for (const side of responses) { assert.ok(side.length >= 2); for (const response of side) { assert.equal(response.status, 200); assert.ok(fontAssets.some(asset => asset.sha256 === response.sha256)); } }
      for (const faces of sample.fonts.loaded) for (const spec of ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400']) assert.ok(faces.some(face => `${face.family.replaceAll('"', '')}:${face.weight}` === spec));
      const pages = [a.page, b.page];
      sample.geometry = await Promise.all(pages.map(page => page.evaluate(() => ({
        html: document.documentElement.outerHTML, text: document.body.innerText,
        rects: [...document.querySelectorAll('h1,h2,h3,main,.page,.pbody,.set,.set-body,[data-settings-body],.side,.shell-layout,.topbar,.topbar,.board-col,.cal-g,.tl')].map(el => {
          const css = getComputedStyle(el);
          return { tag: el.tagName, class: el.className, rect: el.getBoundingClientRect().toJSON(), computed: Object.fromEntries(['display','padding','margin','fontFamily','fontSize','lineHeight','fontWeight','color','backgroundColor','gridTemplateColumns','overflow','transform'].map(key => [key, css[key]])) };
        }),
        scrollers: [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 1 && ['auto','scroll'].includes(getComputedStyle(el).overflowY)).map(el => ({ tag: el.tagName, class: el.className, id: el.id, top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight })),
        animations: document.getAnimations().map(animation => ({ name: animation.animationName ?? null, playState: animation.playState, currentTime: animation.currentTime, timing: animation.effect?.getTiming(), keyframes: animation.effect?.getKeyframes(), target: animation.effect?.target?.outerHTML?.slice(0, 300) })),
        art: [...document.querySelectorAll('.fprev,.art,.file-preview,.file-art,.fprev svg,.file-art svg,.fprev svg path,.file-art svg path,.fprev svg circle,.file-art svg circle')].map(el => ({ html: el.outerHTML, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(el)].map(key => [key, getComputedStyle(el).getPropertyValue(key)])), svgCtm: el.getScreenCTM?.()?.toString() ?? null })),
      }))));
      sample.qualifiedRegions = await qualifiedRegions(a.page, b.page, row);
      for (const page of pages) await page.mouse.move(row.width - 1, height - 1);
      const source = await a.page.screenshot({ animations: 'allow', caret: 'hide' }), sourceRepeat = await a.page.screenshot({ animations: 'allow', caret: 'hide' }), target = await b.page.screenshot({ animations: 'allow', caret: 'hide' }), targetRepeat = await b.page.screenshot({ animations: 'allow', caret: 'hide' });
      sample.captures.push({ source: store(`${row.id}-source.png`, source), sourceRepeat: store(`${row.id}-source-repeat.png`, sourceRepeat), target: store(`${row.id}-target.png`, target), targetRepeat: store(`${row.id}-target-repeat.png`, targetRepeat), comparison: compare(source, target, row.id), sourceRepeatComparison: compare(source, sourceRepeat, `${row.id}-source-repeat`), targetRepeatComparison: compare(target, targetRepeat, `${row.id}-target-repeat`) });
      sample.pageErrors = errors;
      if (sample.qualifiedRegions) sample.qualifiedPartition = partitionPixels(PNG.sync.read(source), PNG.sync.read(target), sample.qualifiedRegions);
      sample.status = sample.captures.every(capture => !capture.comparison.pixels && !capture.sourceRepeatComparison.pixels && !capture.targetRepeatComparison.pixels) && !errors.flat().length ? 'passed' : 'failed';
      if (sample.status === 'failed' && sample.qualifiedRegions && sample.qualifiedPartition.outside === 0 && sample.qualifiedPartition.inside === sample.captures[0].comparison.pixels && sample.captures.every(capture => !capture.sourceRepeatComparison.pixels && !capture.targetRepeatComparison.pixels) && !errors.flat().length) sample.status = 'qualified';
    } catch (error) { sample.status = 'failed'; sample.error = String(error.stack); sample.pageErrors = errors; sample.fontResponses = responses; }
    save(); console.log(`${sample.id}: ${sample.status} ${sample.captures[0]?.comparison.pixels ?? 'no comparison'}`);
    await a.context.close(); await b.context.close();
  }
  report.immutableAfter = immutableInputs(); report.assetsAfter = assets(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.assetsBefore, report.assetsAfter); checkSource();
  report.status = report.samples.length === matrix.length && report.samples.every(sample => ['passed', 'qualified'].includes(sample.status)) ? 'passed' : 'failed'; save();
  if (report.status !== 'passed') process.exitCode = 1;
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); await stopTarget?.(); await stopSource?.(); }
