import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { readiness } from '../reference/source-driver.mjs';
import { artifacts, readJson, sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

const attempt = process.argv[2], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() }), workspaceId = sourceId('workspaces', 'w1'), taskId = sourceId('tasks', 't3'), notificationId = sourceId('notifs', 'n1');
const report = { status: 'running', scope: 'Actual Source and current production Mock native per-task unposted comment draft shared between Inbox/Drawer and retained across route changes. No browser-refresh draft persistence claim.', runtime: { node: process.version, os: 'linux', ...environment, reducedMotion: 'reduce' }, immutableBefore: immutableInputs(), assetsBefore: assets(), profiles: [] };
const save = () => fs.writeFileSync(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
const store = (name, bytes) => { const path = `${output}/${name}`; fs.writeFileSync(path, bytes, { flag: 'wx' }); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
let browser, stopSource, stopTarget;
try {
 stopSource = await sourceServer(); stopTarget = await targetServer(); checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
 for (const side of ['source', 'target']) {
  const fixture = side === 'source' ? readJson(`${artifacts}/source-fixture.json`) : undefined, profile = { side, status: 'running', actions: [], observations: [], errors: [], fontResponses: [], sourceTaskId: 't3', canonicalTaskId: taskId }; report.profiles.push(profile); save();
  const session = await newPage(browser, { viewport: { width: 1440, height: 1000 }, mobile: false }, fixture, true, side === 'target' ? 'http://127.0.0.1:5173' : undefined), page = session.page, pending = []; await page.emulateMedia({ reducedMotion: 'reduce' }); page.on('pageerror', error => profile.errors.push(String(error))); page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); profile.fontResponses.push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
  const row = page.locator(side === 'source' ? '[data-a=selNotif][data-id=n1]' : `[data-notification-id="${notificationId}"]`), preview = page.locator(side === 'source' ? '.inbox-prev' : '[data-inbox-preview]'), drawer = page.locator(side === 'source' ? '.drawer' : `[data-task-drawer="${taskId}"]`), draft = preview.getByRole('textbox', { name: 'Reply', exact: true });
  const observe = async label => { const value = await draft.inputValue(), screenshot = store(`${side}-${label}.png`, await page.screenshot({ animations: 'allow', caret: 'hide' })); profile.observations.push({ label, inboxDraft: value, screenshot, url: page.url() }); save(); };
  const route = async route => { if (side === 'source') await page.locator(`.side [data-a=go][data-r="${route}"]`).first().click(); else await page.getByRole('navigation', { name: 'Main', exact: true }).locator(`a[href="/w/${workspaceId}/${route}"]`).click(); profile.actions.push({ kind: 'actual sidebar click', route, url: page.url() }); save(); };
  try {
   await page.goto(side === 'source' ? 'http://127.0.0.1:4173/#inbox' : `http://127.0.0.1:5173/w/${workspaceId}/inbox`); if (side === 'source') await readiness(page); else { await page.waitForSelector('[data-notifications-ready]'); await ready(page); }
   await row.click(); await draft.waitFor(); await draft.fill('WU29 shared Inbox draft'); profile.actions.push({ kind: 'native fill Inbox draft', taskId }); await observe('inbox-entered');
   await preview.getByRole('button', { name: 'Open task', exact: true }).click(); await drawer.waitFor(); const comment = drawer.getByRole('textbox', { name: 'Comment', exact: true }); await comment.waitFor(); const drawerValue = await comment.inputValue(); profile.observations.push({ label: 'drawer-opened', drawerDraft: drawerValue, screenshot: store(`${side}-drawer-opened.png`, await page.screenshot({ animations: 'allow', caret: 'hide' })) }); save();
   await comment.fill('WU29 shared Drawer edit'); await drawer.getByRole('button', { name: 'Close', exact: true }).click(); await observe('returned-inbox');
   await preview.getByRole('button', { name: 'Back', exact: true }).click(); await route('notifications'); await route('inbox'); await row.click(); await observe('route-return');
   await Promise.all(pending); profile.loadedFonts = await page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => ({ family: face.family, weight: face.weight }))); save();
   assert.equal(drawerValue, 'WU29 shared Inbox draft'); assert.equal(profile.observations.find(row => row.label === 'returned-inbox').inboxDraft, 'WU29 shared Drawer edit'); assert.equal(profile.observations.find(row => row.label === 'route-return').inboxDraft, 'WU29 shared Drawer edit'); assert.deepEqual(profile.errors, []);
   const locked = readJson(`${artifacts}/font-assets.json`).assets; for (const font of profile.fontResponses) { assert.equal(font.status, 200); assert.ok(locked.some(asset => asset.sha256 === font.sha256)); } for (const spec of ['Geist:400', 'Geist:500', 'Geist:600', 'Geist Mono:400']) assert.ok(profile.loadedFonts.some(face => `${face.family.replaceAll('"', '')}:${face.weight}` === spec)); profile.status = 'passed';
  } catch (error) { profile.status = 'failed'; profile.error = String(error.stack); }
  save(); console.log(`${side}: ${profile.status} ${profile.observations.map(row => `${row.label}=${row.inboxDraft ?? row.drawerDraft}`).join('; ')}`); await session.context.close();
 }
 report.immutableAfter = immutableInputs(); report.assetsAfter = assets(); save(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.assetsBefore, report.assetsAfter); checkSource(); report.status = report.profiles.every(profile => profile.status === 'passed') ? 'passed' : 'failed'; save(); if (report.status !== 'passed') process.exitCode = 1;
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); await stopTarget?.(); await stopSource?.(); }
