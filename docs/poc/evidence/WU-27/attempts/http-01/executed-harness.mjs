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
const attempt = process.argv[2], output = `docs/poc/evidence/WU-27/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const client = createMockClient(), assets = () => ({ ...implementationAssets(), ...httpBuildAssets() });
const report = { status: 'running', runtime: { node: process.version, ...environment }, probes: [], requests: [], assetsBefore: assets(), immutableBefore: immutableInputs(), scope: 'Actual HTTP production adapter with canonical typed read-only fixture responses. Only getSession capabilities.dataMode=http and authentication/workspaceProvisioning/invitations=unavailable are projected; principal and other fields unchanged. No writes, HTTP fallback, real backend, email, password auth or API access grant.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const write = (name, bytes) => { const file = `${output}/${name}`; fs.writeFileSync(file, bytes, { flag: 'wx' }); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const stdout = fs.openSync(`${output}/server.stdout`, 'wx'), stderr = fs.openSync(`${output}/server.stderr`, 'wx');
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort', '--outDir', 'dist-http'], { cwd: path.resolve('apps/web'), stdio: ['ignore', stdout, stderr] });
let browser, page, context, held, holdSession = false, failSession = false;
const requestRows = new Map(), observedBodies = [];
async function probe(id, run) { report.active = id; save(); const details = await run(); report.probes.push({ id, status: 'passed', ...details }); save(); console.log(`${id}: passed`); }
async function entry(route) { await page.goto(`http://127.0.0.1:5173${route}`); await page.waitForSelector('[data-onboarding-step]'); }
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  ({ page, context } = await newPage(browser, { viewport: { width: 390, height: 844 }, mobile: true }, undefined, true, 'http://127.0.0.1:5173'));
  const principalBefore = (await client.execute('getSession', {})).data.user; report.principalBeforeSha256 = sha256(JSON.stringify(principalBefore));
  page.on('response', response => { if (response.url().includes('/api/v1/')) observedBodies.push((async () => { const row = requestRows.get(response.request()); assert.ok(row); const bytes = await response.body(); row.observed = { status: response.status(), body: write(`request-${row.requestIndex}-observed-body.json`, bytes) }; save(); })()); });
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const requestIndex = report.requests.length, entry = { requestIndex, method: request.method(), path: url.pathname, outcome: 'pending' }; report.requests.push(entry); requestRows.set(request, entry); save();
    try {
      assert.equal(request.method(), 'GET'); assert.equal(request.postData(), null);
      const row = Object.entries(operations).find(([, operation]) => operation.method === request.method() && new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`).test(url.pathname));
      assert.ok(row, url.pathname); const [id, operation] = row;
      const keys = [...operation.path.matchAll(/\{(\w+)\}/g)].map(row => row[1]), match = url.pathname.match(new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`));
      const input = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
      if (url.search) input.query = Object.fromEntries([...url.searchParams].map(([key, value]) => [key, key === 'limit' ? Number(value) : ['archived', 'unreadOnly', 'favoriteOnly'].includes(key) ? value === 'true' : key === 'filters' ? JSON.parse(value) : value]));
      if (id === 'getSession' && failSession) { entry.outcome = 'expected-unavailable'; entry.status = 503; const body = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Unavailable fixture' } }); entry.body = write(`request-${requestIndex}-error-body.json`, Buffer.from(body)); await route.fulfill({ status: 503, contentType: 'application/json', body }); save(); return; }
      if (id === 'getSession' && holdSession) await new Promise(resolve => { held = resolve; });
      const response = await client.execute(id, input), before = write(`request-${requestIndex}-before.json`, Buffer.from(JSON.stringify(response)));
      const projected = structuredClone(response);
      if (id === 'getSession') { projected.data.capabilities.dataMode = 'http'; for (const feature of ['authentication', 'workspaceProvisioning', 'invitations']) projected.data.capabilities.features[feature] = 'unavailable'; }
      const after = write(`request-${requestIndex}-after.json`, Buffer.from(JSON.stringify(projected)));
      Object.assign(entry, { operation: id, before, after, projection: id === 'getSession' ? { 'data.capabilities.dataMode': { before: response.data.capabilities.dataMode, after: 'http' }, ...Object.fromEntries(['authentication', 'workspaceProvisioning', 'invitations'].map(feature => [`data.capabilities.features.${feature}`, { before: response.data.capabilities.features[feature], after: 'unavailable' }])) } : 'None', outcome: 'passed' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projected) }); save();
    } catch (error) { entry.outcome = 'failed'; entry.error = String(error); save(); await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); }
  });
  const seed = (await client.execute('getSession', {})).data.currentWorkspaceId;
  const key = 'task8.demo.onboarding.http.v1';
  const draft = { flowId: '019e649f-0280-7000-8000-000000000099', completedStep: 4, use: 'product', team: 'kanban', size: '2-10', ws: 'Sample workspace', url: 'sample', urlTouched: false, proj: 'Sample project', projTouched: false, tmpl: 'web', invites: ['one@example.com', '', ''] };
  await context.addInitScript(({ key, draft }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ draft, result: null })); }, { key, draft });
  await probe('H27-01-unavailable-six-steps', async () => {
    for (let step = 0; step < 6; step++) { await entry(`/onboarding?step=${step}`); await expect(page.getByRole('button', { name: 'Open demo', exact: true })).toBeVisible(); await expect(page.locator(step === 5 ? 'button:has-text("Open workspace")' : '#onb-next')).toBeDisabled(); }
    assert.equal(report.requests.length, 0); return { routes: 6, noProvisioningRequests: true, unavailableTruthful: true };
  });
  await probe('H27-02-failure-no-fallback', async () => {
    await entry('/onboarding?step=5'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); failSession = true;
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click(); await expect(page.getByText('Demo setup could not be opened. Try again. No account or email was created.')).toBeVisible();
    assert.equal(new URL(page.url()).pathname, '/onboarding'); assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).result, key), null); failSession = false;
    return { actual503: true, noMockFallback: true, noSuccessReceipt: true };
  });
  await probe('H27-03-loading-close-cancels-navigation', async () => {
    holdSession = true; await page.getByRole('button', { name: 'Open workspace', exact: true }).dblclick(); await expect(page.getByRole('button', { name: 'Open workspace', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => !!held).toBe(true); await page.getByRole('button', { name: 'Close demo', exact: true }).click(); const release = held; held = undefined; holdSession = false; release(); await page.waitForTimeout(250);
    assert.equal(new URL(page.url()).pathname, '/onboarding'); await expect(page.getByRole('button', { name: 'Open demo', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open workspace', exact: true })).toBeDisabled();
    return { heldGET: true, doubleClickSinglePending: true, explicitCloseInvalidatesNavigation: true, settledReceiptDoesNotNavigate: true };
  });
  await probe('H27-04-revalidate-stale-receipt-fixed-seed', async () => {
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify({ draft, result: { workspaceId: draft.flowId, projectId: null, mode: 'seed-demo' } })), { key, draft });
    await entry('/onboarding?step=5'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); const requestCount = report.requests.length;
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click(); await expect(page).toHaveURL(`http://127.0.0.1:5173/w/${seed}/home`);
    const receipt = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).result, key); assert.deepEqual(receipt, { workspaceId: seed, projectId: null, mode: 'seed-demo' }); assert.ok(report.requests.slice(requestCount).some(row => row.operation === 'getSession'));
    assert.equal(report.requests.filter(row => row.method !== 'GET').length, 0); const keys = await page.evaluate(() => Object.keys(localStorage)); assert.equal(keys.some(key => key.startsWith('task8.mock.v1')), false);
    assert.equal(report.principalBeforeSha256, sha256(JSON.stringify((await client.execute('getSession', {})).data.user)));
    return { freshConfiguredSeedRead: true, staleReceiptReplaced: true, realWrites: 0, mockStorage: false, principalUnchanged: true };
  });
  await Promise.all(observedBodies);
  for (const row of report.requests) { assert.ok(row.observed); assert.equal(row.observed.status, row.outcome === 'expected-unavailable' ? 503 : 200); assert.equal(row.observed.body.sha256, (row.after ?? row.body).sha256); }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited; } fs.closeSync(stdout); fs.closeSync(stderr); report.server = { exitStatus: server.exitCode, signal: server.signalCode }; save(); }
