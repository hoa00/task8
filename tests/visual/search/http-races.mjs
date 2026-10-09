import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { newPage } from '../reference/environment.mjs';
import { ready } from '../tasks/verify.mjs';
import { operations } from '../../../packages/contracts/src/operations.ts';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { createMockClient } from '../../../apps/web/src/data/adapters/mock.ts';
const evidence = 'docs/poc/evidence/WU-18', attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10) ?? 'http-races-01', output = `${evidence}/attempts/${attempt}`;
if (fs.existsSync(output)) throw Error('Attempt already exists'); fs.mkdirSync(output, { recursive: true });
const report = { status: 'running', probes: [], requests: [], failures: [], runtime: { node: process.version }, scope: 'Actual HTTP-built app/HTTP adapter/useWorkspaceSearch query lifecycle; intercepted typed contract responses, deterministic held requests. No real backend claim or Source synchronous-error equivalence.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort', '--outDir', 'dist-http'], { cwd: path.resolve('apps/web'), stdio: 'pipe' }); let logs = ''; server.stdout.on('data', value => logs += value); server.stderr.on('data', value => logs += value);
let browser, page; const client = createMockClient(), workspaceId = sourceId('workspaces', 'w1'), held = new Map(), failures = new Set(); let sequence = 0;
const stop = async () => { if (server.exitCode === null) { const done = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await done; } };
async function probe(id, work) { const details = await work(); report.probes.push({ id, status: 'passed', ...details }); save(); console.log(id); }
const requestsFor = q => report.requests.filter(row => row.operation === 'search' && row.q === q);
try {
 for (let n = 0; n < 40; n++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* owned server startup */ } if (server.exitCode !== null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 100)); }
 browser = await chromium.launch({ headless: true }); report.runtime.browser = browser.version(); const context = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'); page = context.page;
 page.on('requestfailed', request => report.failures.push({ url: request.url(), error: request.failure()?.errorText }));
 await context.context.route('**/api/v1/**', async route => {
  const url = new URL(route.request().url()); let found;
  for (const [id, operation] of Object.entries(operations)) { if (operation.method !== route.request().method()) continue; const keys = [...operation.path.matchAll(/\{(\w+)\}/g)].map(row => row[1]), match = url.pathname.match(new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`)); if (match) { found = { id, input: Object.fromEntries(keys.map((key, n) => [key, decodeURIComponent(match[n + 1])])) }; break; } }
  if (!found) throw Error(`Unrecognized contract operation ${url.pathname}`);
  const { id, input } = found; if (url.search) input.query = Object.fromEntries([...url.searchParams].map(([key, value]) => { if (['limit'].includes(key)) return [key, Number(value)]; if (['archived', 'unreadOnly'].includes(key)) return [key, value === 'true']; if (['filters'].includes(key)) return [key, JSON.parse(value)]; return [key, value]; }));
  const entry = { sequence: ++sequence, operation: id, q: input.query?.q, category: input.query?.category, started: Date.now(), outcome: 'pending' }; report.requests.push(entry);
  const q = input.query?.q;
  if (id === 'search' && q?.startsWith('held-')) { await new Promise(resolve => held.set(q, resolve)); }
  try {
   if (id === 'search' && failures.has(q)) { entry.outcome = 'error'; await route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: `Search failed for ${q}` } } }); return; }
   if (id === 'search' && q?.startsWith('held-')) input.query.q = 'pricing';
   const response = await client.execute(id, input); if (id === 'getSession') response.data.capabilities.dataMode = 'http';
   entry.outcome = 'fulfilled'; await route.fulfill({ status: 200, json: response });
  } catch (error) { entry.outcome = 'aborted-or-error'; entry.error = String(error); }
 });
 await page.goto(`http://127.0.0.1:5173/w/${workspaceId}/search`); await page.waitForSelector('[data-search-ready]'); await ready(page); const input = page.getByRole('textbox', { name: 'Search', exact: true });
 await probe('S18-Q01-rapid-input-debounce-skips-obsolete-query', async () => {
  await input.fill('debounce-obsolete'); await input.fill('pricing'); await page.waitForSelector('[data-search-ready]'); assert.equal(requestsFor('debounce-obsolete').length, 0); assert.equal(requestsFor('pricing').length, 1); assert.ok(await page.locator('[data-search-result=tasks]').count()); return { obsoleteRequests: 0, currentRequests: 1 };
 });
 await probe('S18-Q02-inflight-cancel-and-late-old-response-cannot-overwrite-new', async () => {
  await input.fill('held-old-query'); await expect.poll(() => held.has('held-old-query')).toBe(true); await input.fill('wireframes'); await page.waitForSelector('[data-search-ready]'); const current = await page.locator('[data-search-result]').allTextContents(); held.get('held-old-query')(); held.delete('held-old-query'); await expect.poll(() => requestsFor('held-old-query')[0]?.outcome).not.toBe('pending'); assert.deepEqual(await page.locator('[data-search-result]').allTextContents(), current); assert.equal(await input.inputValue(), 'wireframes'); await expect.poll(() => report.failures.some(row => row.url.includes('held-old-query') && /ABORTED/i.test(row.error))).toBe(true); return { currentQuery: 'wireframes', lateResultIgnored: true, actualAbortedRequest: true };
 });
 await probe('S18-Q03-query-error-retry-without-successful-empty-fallback', async () => {
  failures.add('recoverable-query'); await input.fill('recoverable-query'); await page.getByRole('alert').filter({ hasText: 'Search failed for recoverable-query' }).waitFor(); assert.equal(await page.locator('[data-search-result]').count(), 0); failures.delete('recoverable-query'); await page.getByRole('button', { name: 'Try again', exact: true }).click(); await page.getByRole('heading', { name: 'No results found', exact: true }).waitFor(); assert.ok(requestsFor('recoverable-query').length >= 2); return { errorVisible: true, retryActualRequest: true, falseEmptySuccess: false };
 });
 await probe('S18-Q04-late-error-does-not-replace-current-query', async () => {
  failures.add('held-old-error'); await input.fill('held-old-error'); await expect.poll(() => held.has('held-old-error')).toBe(true); await input.fill('fig'); await page.waitForSelector('[data-search-ready]'); const current = await page.locator('[data-search-result]').allTextContents(); held.get('held-old-error')(); held.delete('held-old-error'); await expect.poll(() => requestsFor('held-old-error')[0]?.outcome).not.toBe('pending'); assert.deepEqual(await page.locator('[data-search-result]').allTextContents(), current); assert.equal(await page.getByRole('alert').count(), 0); return { currentQuery: 'fig', oldErrorIgnored: true };
 });
 await probe('S18-Q05-palette-error-clears-in-inactive-workspace-mode', async () => {
  await page.getByRole('button', { name: 'Search and commands', exact: true }).click(); await page.locator('#pal-in').press('Tab'); failures.add('palette-error'); await page.locator('#pal-in').fill('palette-error'); await page.getByRole('alert').filter({ hasText: 'palette-error' }).waitFor(); await page.locator('#pal-in').press('Tab'); await page.locator('#pal-in').fill('Switch workspace'); await page.getByRole('option', { name: 'Switch workspace…', exact: true }).click(); await page.locator('#pal-in').fill('palette-error'); await page.getByRole('heading', { name: 'No results found', exact: true }).waitFor(); assert.equal(await page.getByRole('alert').count(), 0); return { inactiveSearchErrorHidden: true, sameCachedErrorQuery: 'palette-error', workspaceNoResults: true };
 });
 await probe('S18-Q06-palette-query-cancel-category-isolation', async () => {
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Search and commands', exact: true }).click(); await page.locator('#pal-in').press('Tab'); await page.locator('#pal-in').fill('held-old-palette'); await expect.poll(() => held.has('held-old-palette')).toBe(true); await page.locator('#pal-in').fill('fig'); await page.getByRole('tab', { name: 'Files', exact: true }).click(); await page.waitForSelector('[data-palette-ready]'); const files = await page.locator('[data-palette-item^="files:"]').allTextContents(); held.get('held-old-palette')(); held.delete('held-old-palette'); await expect.poll(() => requestsFor('held-old-palette')[0]?.outcome).not.toBe('pending'); assert.deepEqual(await page.locator('[data-palette-item^="files:"]').allTextContents(), files); assert.equal(await page.locator('[data-palette-item^="tasks:"]').count(), 0); return { filesScopeRetained: true, priorPaletteResponseIgnored: true };
 });
 report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); await page?.screenshot({ path: `${output}/failed.png` }); throw error; } finally { for (const resolve of held.values()) resolve(); await browser?.close(); await stop(); fs.writeFileSync(`${output}/server.log`, logs); }
