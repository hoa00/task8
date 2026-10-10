import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage } from '../reference/environment.mjs';
import { artifacts, readJson } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { implementationAssets, httpBuildAssets, sourceAssets, immutableInputs } from '../settings/assets.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-28/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const report = { status: 'running', assets: { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }, locks: immutableInputs(), qualification: 'Read-only computed style/parent/DOM diagnostic; not visual acceptance.', samples: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
let browser; const sourceStop = await sourceServer(), targetStop = await targetServer();
try {
  browser = await chromium.launch({ args: ['--disable-partial-raster'] });
  const fixture = readJson(`${artifacts}/source-fixture.json`);
  fs.writeFileSync(`${output}/source-original.json`, JSON.stringify(fixture, null, 2) + '\n');
  for (const side of ['source', 'target']) {
    const session = await newPage(browser, {}, side === 'source' ? fixture : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173'), page = session.page;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const view of ['system', '404']) {
      await page.goto(side === 'source' ? `http://127.0.0.1:4173/#${view === 'system' ? 'system' : 'states'}` : `http://127.0.0.1:5173/${view === 'system' ? 'dev/design-system' : `w/${sourceId('workspaces', 'w1')}/nowhere`}`);
      await page.waitForSelector(side === 'source' ? (view === '404' ? '.states-grid' : '.page') : (view === '404' ? '[data-fullstate]' : '[data-design-system]')); await ready(page);
      if (view === '404' && side === 'source') { await page.getByRole('button', { name: 'Open example', exact: true }).nth(1).click(); await ready(page); }
      await page.mouse.move(1439, 999); await page.evaluate(() => document.activeElement?.blur());
      const selectors = side === 'source' ? (view === 'system' ? '.rte-tb span,.chip,.chip b,.chip svg,.sitem.on,.sitem.on .ct,.sitem.on svg,.sitem .pico,.sitem .pico svg,.av.more,.ds-sec code,.link' : '.fullstate,.fullstate .box,.fullstate p,.fullstate button,.fullstate button svg') : (view === 'system' ? '[data-design-system] [for="ds-9"], [data-gallery-section="Inputs"] svg,[data-gallery-section="Navigation"] span,[data-gallery-section="Navigation"] svg,[data-gallery-section="Data display"] [role=img],[data-gallery-section="Spacing, radius, elevation"] code,[data-gallery-section="Feedback"] span' : '[data-fullstate],[data-fullstate]>div,[data-fullstate] p,[data-fullstate] button,[data-fullstate] button svg');
      const values = await page.evaluate(selectors => [...document.querySelectorAll(selectors)].map(el => ({ html: el.outerHTML, rect: el.getBoundingClientRect().toJSON(), css: Object.fromEntries([...getComputedStyle(el)].map(k => [k, getComputedStyle(el).getPropertyValue(k)])), parents: [...function* () { let p = el.parentElement; for (let i = 0; p && i < 5; i++, p = p.parentElement) yield { html: p.outerHTML.slice(0, 200), css: Object.fromEntries([...getComputedStyle(p)].map(k => [k, getComputedStyle(p).getPropertyValue(k)])), rect: p.getBoundingClientRect().toJSON() }; }()] })), selectors);
      const path = `${output}/${side}-${view}.json`; fs.writeFileSync(path, JSON.stringify(values, null, 2) + '\n'); report.samples.push({ side, view, path, count: values.length }); save();
    }
    await session.context.close();
  }
  report.status = 'diagnosis-complete'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await sourceStop(); await targetStop(); }
