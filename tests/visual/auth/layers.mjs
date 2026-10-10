import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { newPage } from '../reference/environment.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { readJson, artifacts } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
const stopSource = await sourceServer(), stopTarget = await targetServer(), browser = await chromium.launch({ args: ['--disable-partial-raster'] });
const output = `docs/poc/evidence/WU-26/attempts/${process.argv[2]}`; fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const report = [];
try { for (const side of ['source', 'target']) {
  const { page, context } = await newPage(browser, { viewport: { width: 390, height: 844 }, mobile: true }, side === 'source' ? readJson(`${artifacts}/source-fixture.json`) : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173');
  await page.goto(side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173/signup');
  if (side === 'source') { await sourcePreferences(page, { theme: 'light', accent: 'indigo', motion: 'system' }); await page.evaluate(async () => { const { S } = await import('/src/core/store.js'); S.ui.auth = 'signup'; S.ui.errors = {}; S.ui.af = { email: 'hello@gr8rstudio.com', name: '' }; S.ui.pwNew = ''; S.ui.resendT = 0; (await import('/src/shell/render.js')).render(); }); }
  else await page.waitForSelector('[data-auth-card]');
  await ready(page); await page.locator('#signup-btn').click(); await ready(page);
  const cdp = await context.newCDPSession(page); let layers = []; await cdp.send('LayerTree.enable'); cdp.on('LayerTree.layerTreeDidChange', event => layers = event.layers ?? []);
  await page.waitForTimeout(700); await page.screenshot({ path: `${output}/${side}.png`, animations: 'disabled', caret: 'hide' });
  const reasons = [];
  for (const layer of layers) { try { reasons.push({ layer, reasons: await cdp.send('LayerTree.compositingReasons', { layerId: layer.layerId }) }); } catch { /* layer detached */ } }
  report.push({ side, reasons, elements: await page.evaluate(() => [...document.querySelectorAll('html,body,#app,#root,.auth,[data-auth-layout],.auth-c,[data-auth-content],.auth-card,[data-auth-card],.auth-foot,.auth-card>*,[data-auth-card]>*,.auth input,[data-auth-layout] input')].map(el => ({ tag: el.tagName, id: el.id, className: el.className, rect: el.getBoundingClientRect().toJSON(), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop, css: Object.fromEntries(['display', 'flex', 'minHeight', 'height', 'overflow', 'transform', 'willChange', 'contain', 'opacity', 'position', 'fontFamily', 'fontSize', 'fontWeight', 'fontFeatureSettings', 'WebkitFontSmoothing', 'lineHeight', 'borderRadius', 'padding', 'margin', 'boxSizing', 'background', 'color', 'animation', 'zoom'].map(key => [key, getComputedStyle(el)[key]])) }))) });
  await cdp.detach(); await context.close();
} fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report.map(row => ({ side: row.side, layers: row.reasons.length, elements: row.elements.length })))); }
finally { await browser.close(); await stopTarget(); await stopSource(); }
