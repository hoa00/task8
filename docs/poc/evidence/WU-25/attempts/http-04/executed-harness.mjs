import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { operations } from '../../../packages/contracts/src/operations.ts';
import { createMockClient } from '../../../apps/web/src/data/adapters/mock.ts';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { newPage, environment } from '../reference/environment.mjs';
import { sha256 } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets } from './assets.mjs';
const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10), output = `docs/poc/evidence/WU-25/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync('tests/visual/settings/security-http.mjs', `${output}/executed-harness.mjs`);
const workspaceId = sourceId('workspaces', 'w1'), secondWorkspaceId = sourceId('workspaces', 'w2'), base = `http://127.0.0.1:5173/w/${workspaceId}/settings`, client = createMockClient();
const maps = () => ({ ...implementationAssets(), ...httpBuildAssets() });
const report = { status: 'running', runtime: { node: process.version, ...environment }, scope: 'Actual production HTTP adapter, typed canonical mock read responses intercepted with security/billing unavailable. Explicit isolated demo scenarios; no real backend, auth, TOTP, payment, sessions or API principal mutation. The scope-switch probe exposes a second read-only workspace by projecting only workspace ID/name of typed fixture responses; original canonical mock remains unchanged.', probes: [], requests: [], immutableBefore: immutableInputs(), assetsBefore: maps() };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const stdout = fs.openSync(`${output}/server.stdout`, 'wx'), stderr = fs.openSync(`${output}/server.stderr`, 'wx');
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort', '--outDir', 'dist-http'], { cwd: path.resolve('apps/web'), stdio: ['ignore', stdout, stderr] });
let browser, page, context, exposeSecondWorkspace = false;
const serverFailure = [];
server.on('error', error => { serverFailure.push(error.code ?? String(error)); });
async function stop() { if (server.exitCode === null && !serverFailure.length) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited; } fs.closeSync(stdout); fs.closeSync(stderr); report.server = { exitStatus: server.exitCode, signal: server.signalCode, errors: serverFailure }; save(); }
async function section(name) { await page.goto(`${base}/${name}`); await page.waitForSelector('[data-settings-ready]'); }
async function probe(id, run) { const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);if(only&&!only.split(',').some(prefix=>id.startsWith(prefix)))return;report.active = id; save(); const value = await run(); report.probes.push({ id, status: 'passed', ...value }); save(); }
async function chooseScenario(value) { await page.getByRole('button', { name: 'Demo scenario', exact: true }).click(); await page.getByRole('option', { name: value, exact: true }).click(); }
async function password() { await page.locator('#pw-cur').fill('demo-current'); await page.locator('#pw-new').fill('abcdefghijk1!'); await page.locator('#pw-conf').fill('abcdefghijk1!'); }
function projectWorkspace(value) { if (Array.isArray(value)) return value.map(projectWorkspace); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, projectWorkspace(nested)])); return value === workspaceId ? secondWorkspaceId : value; }
try {
  for (let index = 0; index < 40; index++) { if (serverFailure.length || server.exitCode !== null) throw Error(`HTTP preview failed: ${serverFailure.join(',')}`); try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* Preview starting. */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  const session = await newPage(browser, process.argv.includes('--mobile')?{viewport:{width:390,height:844},mobile:true}:{}, undefined, true, 'http://127.0.0.1:5173'); page = session.page; context = session.context;
  const principalBefore = await client.api.getSession({}); report.principalBeforeSha256 = sha256(JSON.stringify(principalBefore));
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()); let found;
    for (const [id, operation] of Object.entries(operations)) {
      if (operation.method !== request.method()) continue;
      const keys = [...operation.path.matchAll(/\{(\w+)\}/g)].map(row => row[1]), match = url.pathname.match(new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`));
      if (match) { found = { id, input: Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])])) }; break; }
    }
    if (!found) throw Error(`Unknown operation ${url.pathname}`);
    const { id, input } = found;
    if (url.search) input.query = Object.fromEntries([...url.searchParams].map(([key, value]) => [key, key === 'limit' ? Number(value) : ['archived', 'unreadOnly', 'favoriteOnly'].includes(key) ? value === 'true' : key === 'filters' ? JSON.parse(value) : value]));
    if (request.postData()) input.body = request.postDataJSON();
    const entry = { operation: id, method: request.method(), input, outcome: 'pending' }; report.requests.push(entry);
    try {
      const response = await client.execute(id, { ...input, ...(input.workspaceId === secondWorkspaceId ? { workspaceId } : {}) });const beforeBody=JSON.stringify(response);
      if (id === 'getSession') { response.data.capabilities.dataMode = 'http'; response.data.capabilities.features.accountSecurity = 'unavailable'; response.data.capabilities.features.billing = 'unavailable'; response.data.capabilities.features.authentication = 'unavailable'; }
      if (id === 'listWorkspaces' && exposeSecondWorkspace) response.data = response.data.map(row => row.id === secondWorkspaceId ? { ...row, name: 'WU25 scoped demo workspace' } : row);
      if (input.workspaceId === secondWorkspaceId) { response.data = projectWorkspace(response.data); if (id === 'getBootstrap' || id === 'getWorkspace') { const workspace = id === 'getBootstrap' ? response.data.workspace : response.data; workspace.name = 'WU25 scoped demo workspace'; } entry.projection = 'Only typed response workspaceId/name to second read-only demo workspace'; }
      const body=JSON.stringify(response);entry.responseBodyBytes=Buffer.byteLength(body);entry.responseBodySha256=sha256(body);if(body!==beforeBody){const prefix=`${output}/projection-${report.requests.length}`;fs.writeFileSync(`${prefix}-before.json`,beforeBody);fs.writeFileSync(`${prefix}-after.json`,body);entry.fixtureProjection={kind:'Canonical typed fixture emitter bytes before bounded projection versus actual emitted response body',scope:id==='getSession'?'Only capabilities.dataMode and authentication/accountSecurity/billing unavailable':id==='listWorkspaces'?'Only existing second workspace name':'Only workspaceId references and workspace.name in read-only second-workspace typed fixture',before:{path:`${prefix}-before.json`,bytes:Buffer.byteLength(beforeBody),sha256:sha256(beforeBody)},after:{path:`${prefix}-after.json`,bytes:Buffer.byteLength(body),sha256:sha256(body)}};}entry.outcome = 'fulfilled'; await route.fulfill({ status: operations[id].successStatuses[0], body, contentType:'application/json' });
    } catch (error) { entry.outcome = 'error'; entry.error = String(error); await route.fulfill({ status: error.status ?? 500, json: { error: error.detail ?? { code: 'INTERNAL_ERROR', message: String(error) } } }); }
  });
  await probe('H25-01-all-six-http-unavailable-keeps-source-controls-no-write', async () => {
    for (const [name, controls] of [['password', ['Update password']], ['sessions', ['Sign out', 'Sign out of all other sessions']], ['2fa', ['Set up two-factor authentication']], ['plan', ['Upgrade', 'Downgrade']], ['payment', ['Update', 'Edit']], ['invoices', []]]) {
      await section(name); await expect(page.getByText('Security and billing services are unavailable in this environment.', { exact: true })).toBeVisible();
      for (const label of controls) for (const button of await page.getByRole('button', { name: label, exact: true }).all()) { await expect(button).toBeDisabled(); await button.evaluate(element => element.click()); }
      await expect(page.locator('[data-security-billing-confirm]')).toHaveCount(0);
    }
    await page.screenshot({path:`${output}/unavailable-sixth-section-diagnostic.png`});return { sixSections: true, sourceControlsDisabled: true, explicitOpenDemoAvailable: true, noCompletionOrWrite: true };
  });
  await probe('H25-02-explicit-password-demo-completed-close-reopen-reset', async () => {
    await section('password'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await password(); await page.getByRole('button', { name: 'Update password', exact: true }).click(); await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close demo', exact: true }).click(); await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toHaveCount(0); await expect(page.locator('#pw-new')).toHaveValue(''); await page.locator('#pw-new').fill('typed-draft'); await chooseScenario('error'); await expect(page.locator('#pw-new')).toHaveValue(''); await password(); await page.getByRole('button', { name: 'Update password', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Demo operation failed');
    return { explicitOptIn: true, realDemoCompletion: true, closeClearsSuccessAndDraft: true, scenarioReset: true, explicitErrorNoFalseSuccess: true };
  });
  await probe('H25-03-two-factor-scenario-setup-close-and-unavailable-default-sample', async () => {
    await section('2fa'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await chooseScenario('enabled'); await expect(page.getByText('Two-factor authentication is on.', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close demo', exact: true }).click(); await expect(page.getByText('Two-factor authentication is on.', { exact: true })).toHaveCount(0); await expect(page.getByText('Two-factor authentication is off', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await chooseScenario('normal'); await page.getByRole('button', { name: 'Set up two-factor authentication', exact: true }).click(); await page.locator('#tfa-code').fill('123'); await chooseScenario('business'); await expect(page.locator('#tfa-code')).toHaveCount(0); await page.getByRole('button', { name: 'Set up two-factor authentication', exact: true }).click(); await expect(page.locator('#tfa-code')).toHaveValue('');
    return { unavailableShowsFreshSample: true, scenarioResetsSetupAndCode: true, noRealSecurityClaim: true };
  });
  await probe('H25-04-explicit-plan-payment-demo-no-HTTP-security-billing-or-principal-write', async () => {
    await section('plan'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await page.getByRole('button', { name: 'Upgrade', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Upgrade to Business', exact: true }).click(); await expect(page.locator('[data-plan-card=Business]')).toContainText('Current'); await page.getByRole('button', { name: 'Close demo', exact: true }).click(); await expect(page.locator('[data-plan-card=Team]')).toContainText('Current');
    await section('payment'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await page.getByRole('button', { name: 'Update', exact: true }).click(); await expect(page.getByText('Card updates open in a secure payment window', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByText('Address editing opens in the billing portal', { exact: true })).toBeVisible();
    assert.deepEqual(await client.api.getSession({}), principalBefore);
    return { samplePlanOnly: true, closeRestoresDisabledSourceDefault: true, paymentInfoOnly: true, principalUnchanged: true };
  });
  await probe('H25-05-held-password-native-workspace-switch-owner-isolation', async () => {
    exposeSecondWorkspace = true; await section('password'); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await page.clock.install({ time: new Date(environment.clock) }); await page.clock.pauseAt(new Date('2026-10-08T09:00:01.000Z'));
    await password(); await page.getByRole('button', { name: 'Update password', exact: true }).click(); await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Switch workspace', exact: true }).click(); await page.clock.runFor(40); await page.getByRole('menuitemradio', { name: 'WU25 scoped demo workspace', exact: true }).click(); await page.clock.runFor(80); await expect(page).toHaveURL(new RegExp(secondWorkspaceId));
    await page.getByRole('link', { name: 'Settings', exact: true }).click(); await page.clock.runFor(80); await page.getByRole('link', { name: 'Password', exact: true }).click(); await page.clock.runFor(80); await page.waitForSelector('[data-settings-page=password][data-settings-ready]'); await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();
    await page.clock.runFor(1200); await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toHaveCount(0); await page.getByRole('button', { name: 'Open demo', exact: true }).click(); await expect(page.locator('#pw-cur')).toHaveValue(''); await expect(page.locator('#pw-new')).toHaveValue(''); await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toHaveCount(0);
    return { heldActual800msPasswordTimer: true, clockProjection: 'Only explicitly paused/advanced browser timer during this native scope probe; no visual/motion claim', nativeWorkspaceMenuAndSettingsLinks: true, beforeWorkspaceId: workspaceId, afterWorkspaceId: secondWorkspaceId, oldCompletionCannotBleedIntoNewOwner: true, newOwnerRequiresOptIn: true };
  });
  report.audit = { requests: report.requests.length, writes: report.requests.filter(row => row.method !== 'GET').length, errors: report.requests.filter(row => row.outcome === 'error').length, pending: report.requests.filter(row => row.outcome === 'pending').length };
  assert.equal(report.audit.writes, 0); assert.equal(report.audit.errors, 0); assert.equal(report.audit.pending, 0); assert.deepEqual(await client.api.getSession({}), principalBefore);
  report.principalAfterSha256 = sha256(JSON.stringify(await client.api.getSession({}))); report.immutableAfter = immutableInputs(); report.assetsAfter = maps(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.assetsBefore, report.assetsAfter);
  report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failed.png` }); save(); throw error; }
finally { await browser?.close(); await stop(); }
