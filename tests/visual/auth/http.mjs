import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { operations } from '../../../packages/contracts/src/operations.ts';
import { createMockClient } from '../../../apps/web/src/data/adapters/mock.ts';
import { newPage, environment } from '../reference/environment.mjs';
import { sha256 } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets } from '../settings/assets.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-26/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const client = createMockClient(), assets = () => ({ ...implementationAssets(), ...httpBuildAssets() });
const report = { status: 'running', runtime: { node: process.version, ...environment }, probes: [], requests: [], assetsBefore: assets(), immutableBefore: immutableInputs(), scope: 'Actual HTTP production adapter with canonical typed read-only fixture responses. Only getSession capabilities.dataMode=http and capabilities.features.authentication=unavailable are projected; principal and other fields unchanged. No writes, HTTP fallback, real backend, email, password auth or API access grant.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const write = (name, bytes) => { const file = `${output}/${name}`; fs.writeFileSync(file, bytes, { flag: 'wx' }); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const stdout = fs.openSync(`${output}/server.stdout`, 'wx'), stderr = fs.openSync(`${output}/server.stderr`, 'wx');
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort', '--outDir', 'dist-http'], { cwd: path.resolve('apps/web'), stdio: ['ignore', stdout, stderr] });
let browser, page, context;
async function probe(id, run) { report.active = id; save(); const details = await run(); report.probes.push({ id, status: 'passed', ...details }); save(); console.log(`${id}: passed`); }
async function entry(route) { await page.goto(`http://127.0.0.1:5173${route}`); await page.waitForSelector('[data-auth-layout]'); }
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  ({ page, context } = await newPage(browser, { viewport: { width: 390, height: 844 }, mobile: true }, undefined, true, 'http://127.0.0.1:5173'));
  const principalBefore = (await client.execute('getSession', {})).data.user; report.principalBeforeSha256 = sha256(JSON.stringify(principalBefore));
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const requestIndex = report.requests.length, entry = { requestIndex, method: request.method(), path: url.pathname, outcome: 'pending' }; report.requests.push(entry); save();
    try {
      assert.equal(request.method(), 'GET'); assert.equal(request.postData(), null);
      const row = Object.entries(operations).find(([, operation]) => operation.method === request.method() && new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`).test(url.pathname));
      assert.ok(row, url.pathname); const [id, operation] = row;
      const keys = [...operation.path.matchAll(/\{(\w+)\}/g)].map(row => row[1]), match = url.pathname.match(new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`));
      const input = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
      if (url.search) input.query = Object.fromEntries([...url.searchParams].map(([key, value]) => [key, key === 'limit' ? Number(value) : ['archived', 'unreadOnly', 'favoriteOnly'].includes(key) ? value === 'true' : key === 'filters' ? JSON.parse(value) : value]));
      const response = await client.execute(id, input), before = write(`request-${requestIndex}-before.json`, Buffer.from(JSON.stringify(response)));
      const projected = structuredClone(response);
      if (id === 'getSession') { projected.data.capabilities.dataMode = 'http'; projected.data.capabilities.features.authentication = 'unavailable'; }
      const after = write(`request-${requestIndex}-after.json`, Buffer.from(JSON.stringify(projected)));
      Object.assign(entry, { operation: id, before, after, projection: id === 'getSession' ? { 'data.capabilities.dataMode': { before: response.data.capabilities.dataMode, after: 'http' }, 'data.capabilities.features.authentication': { before: response.data.capabilities.features.authentication, after: 'unavailable' } } : 'None', outcome: 'passed' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projected) }); save();
    } catch (error) { entry.outcome = 'failed'; entry.error = String(error); save(); await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); }
  });
  await probe('H26-01-unavailable-all-seven', async () => {
    const routes = ['/login', '/signup', '/forgot-password', '/forgot-password?state=sent', '/reset-password', '/reset-password?state=done', '/verify-email'];
    for (const route of routes) { await entry(route); await expect(page.getByText('Authentication services are unavailable in this environment. Open the demo to explore these screens.')).toBeVisible(); for (const input of await page.locator('[data-auth-card] input:not([type=checkbox])').all()) await expect(input).toBeDisabled(); await expect(page.getByRole('button', { name: 'Open demo', exact: true })).toBeVisible(); }
    return { routes: 7, truthfulUnavailable: true, apiWrites: 0 };
  });
  await probe('H26-02-opt-in-flow-reset-and-clock', async () => {
    await entry('/signup'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await page.locator('#s-name').fill('Demo Person'); await page.locator('#s-email').fill('demo@example.com'); await page.locator('#s-pw').fill('abcdefghijk1!'); await page.locator('#signup-btn').click(); await expect(page).toHaveURL(/\/verify-email$/); await expect(page.getByText('Demo only · No identity or email delivery')).toBeVisible(); await expect(page.locator('#resend-btn')).toBeDisabled();
    await page.getByRole('button', { name: 'Close demo', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open demo', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await expect(page.locator('#resend-btn')).toBeEnabled(); await page.getByRole('button', { name: 'Change it', exact: true }).click(); await expect(page.locator('#s-name')).toHaveValue(''); await expect(page.locator('#s-email')).toHaveValue(''); await expect(page.locator('#s-pw')).toHaveValue('');
    await page.reload(); await expect(page.getByRole('button', { name: 'Open demo', exact: true })).toBeVisible();
    return { optedInAcrossRoutes: true, closeClearsDraftAndTimer: true, reloadUnavailable: true, noEmailDelivery: true };
  });
  await probe('H26-03-demo-login-cannot-change-principal', async () => {
    await entry('/login'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await page.locator('#l-email').fill('demo@example.com'); await page.locator('#l-pw').fill('sample-untrusted'); await page.locator('#login-btn').click(); await expect(page).toHaveURL(/\/w\/[^/]+\/home$/);
    const stored = await page.evaluate(() => Object.values(localStorage).join('\n')); assert.equal(stored.includes('sample-untrusted'), false); assert.equal(stored.includes('demo@example.com'), false);
    assert.deepEqual((await client.execute('getSession', {})).data.user, principalBefore); return { principalUnchanged: true, credentialStorage: false, apiWrites: 0 };
  });
  assert.ok(report.requests.every(row => row.outcome === 'passed'));
  const paths = report.requests.flatMap(row => [row.before.path, row.after.path]); assert.equal(new Set(paths).size, paths.length);
  for (const row of report.requests) for (const stored of [row.before, row.after]) { const bytes = fs.readFileSync(stored.path); assert.equal(bytes.length, stored.bytes); assert.equal(sha256(bytes), stored.sha256); }
  report.projectionAudit = { files: paths.length, uniquePaths: new Set(paths).size, independentlyRehashed: true };
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited; } fs.closeSync(stdout); fs.closeSync(stderr); report.server = { exitStatus: server.exitCode, signal: server.signalCode }; save(); }
