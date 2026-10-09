import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage } from '../reference/environment.mjs';
import { artifacts, readJson } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('Unique attempt required');
const output = `docs/poc/evidence/WU-19/attempts/${attempt}`;
if (fs.existsSync(output)) throw Error('Never overwrite');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync('tests/visual/notifications/tabs-scroll.mjs', `${output}/executed-harness.mjs`);
const stopSource = await sourceServer(), stopTarget = await targetServer(); let browser;
const report = { status: 'running', sides: [], scope: 'Passive actual native mobile390 Updates tab before/after geometry and scroll; no CSS/fixture/paint changes.' };
try {
  browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] });
  for (const side of ['source', 'target']) {
    const s = await newPage(browser, { viewport: { width: 390, height: 844 }, mobile: true }, side === 'source' ? readJson(`${artifacts}/source-fixture.json`) : undefined, true, side === 'source' ? undefined : 'http://127.0.0.1:5173'), p = s.page;
    await p.goto(side === 'source' ? 'http://127.0.0.1:4173' : `http://127.0.0.1:5173/w/${sourceId('workspaces', 'w1')}/inbox`);
    if (side === 'source') { await p.getByRole('button', { name: 'Open navigation', exact: true }).click(); await p.locator('.side [data-r=inbox]').click(); } else await p.waitForSelector('[data-notifications-ready]');
    await ready(p);
    const metadata = () => p.locator('.inbox-tabs').evaluate(el => ({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, rect: el.getBoundingClientRect().toJSON(), children: [...el.children].map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })) }));
    const before = await metadata(); await p.getByRole('tab', { name: /^Updates/ }).click(); await p.evaluate(() => document.activeElement?.blur()); await ready(p); const after = await metadata();
    report.sides.push({ side, before, after }); await s.context.close();
  }
  report.status = 'passed'; console.log(JSON.stringify(report.sides.map(row => ({ side: row.side, before: row.before.scrollLeft, after: row.after.scrollLeft }))));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); throw error; } finally { fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); await browser?.close(); await stopTarget(); await stopSource(); }
