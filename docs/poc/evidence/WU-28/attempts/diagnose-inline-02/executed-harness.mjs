import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, readJson, sha256 } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { implementationAssets, httpBuildAssets, sourceAssets, immutableInputs } from '../settings/assets.mjs';
const attempt = process.argv[2], root = `docs/poc/evidence/WU-28/attempts/${attempt}`;
assert.ok(attempt && !fs.existsSync(root)); fs.mkdirSync(root, { recursive: true }); fs.copyFileSync(import.meta.filename, `${root}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }), report = { status: 'running', environment, assetsBefore: assets(), immutableBefore: immutableInputs(), samples: [] };
const store = (name, bytes) => { const path = `${root}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const save = () => fs.writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n');
let browser; const stopSource = await sourceServer(), stopTarget = await targetServer();
try {
  browser = await chromium.launch({ args: ['--disable-partial-raster'] });
  for (const side of ['source', 'target']) {
    const fixture = readJson(`${artifacts}/source-fixture.json`), session = await newPage(browser, {}, side === 'source' ? fixture : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173'), page = session.page;
    await page.goto(side === 'source' ? 'http://127.0.0.1:4173/#home' : `http://127.0.0.1:5173/w/${sourceId('workspaces', 'w1')}/projects/${sourceId('projects', 'p1')}/list`);
    if (side === 'source') await page.locator('.side [data-a=go][data-r=project][data-id=p1][data-tab=list]').click();
    await page.waitForSelector('[data-task-row]'); await ready(page);
    await page.evaluate(() => { window.__inlineTrace = []; for (const type of ['click', 'dblclick', 'focusin', 'focusout']) document.addEventListener(type, event => { window.__inlineTrace.push({ type, elapsed: performance.now(), tag: event.target.tagName, class: event.target.className, text: event.target.textContent?.slice(0, 100), defaultPrevented: event.defaultPrevented, focus: document.activeElement?.outerHTML?.slice(0, 250), scroll: document.querySelector('#main-content')?.scrollTop, targetY: event.target.getBoundingClientRect().y, inline: [...document.querySelectorAll('#edit-title,input.task-inline-input')].map(el => el.outerHTML) }); }); });
    const row = page.locator(`[data-task-row="${side === 'source' ? 't3' : sourceId('tasks', 't3')}"]`), title = row.locator(side === 'source' ? '.tt' : '.task-title').first();
    await title.scrollIntoViewIfNeeded(); const beforeScroll = await page.locator('#main-content').evaluate(el => el.scrollTop); await title.click(); await ready(page); const afterScroll = await page.locator('#main-content').evaluate(el => el.scrollTop); report.samples.push({ side, beforeScroll, afterScroll }); save();
    await title.dblclick(); await ready(page);
    report.samples.push({ side, original: store(`${side}-original.json`, Buffer.from(JSON.stringify(fixture))), cold: store(`${side}-cold.json`, Buffer.from(JSON.stringify(await page.evaluate(() => ({ url: location.href, trace: window.__inlineTrace, html: document.documentElement.outerHTML, inputs: [...document.querySelectorAll('#edit-title,input.task-inline-input')].map(el => el.outerHTML) })), null, 2))), coldImage: store(`${side}-cold.png`, await page.screenshot()) }); save();
    await session.context.close();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = 'diagnosis-complete'; save();
} finally { await browser?.close(); await stopTarget(); await stopSource(); }
