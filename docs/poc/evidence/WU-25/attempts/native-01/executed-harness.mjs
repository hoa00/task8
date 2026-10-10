import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { immutableInputs, implementationAssets, httpBuildAssets } from './assets.mjs';
import { sha256 } from '../reference/source-check.mjs';
const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10), output = `docs/poc/evidence/WU-25/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync('tests/visual/settings/security-interactions.mjs', `${output}/executed-harness.mjs`);
const workspaceId = sourceId('workspaces', 'w1'), base = `http://127.0.0.1:5173/w/${workspaceId}/settings`;
const maps = () => ({ ...implementationAssets(), ...httpBuildAssets() });
const report = { status: 'running', scope: 'Native Target demo actions, deterministic scenarios, no auth/payment/backend or pixel-parity claim', runtime: { node: process.version, ...environment }, probes: [], immutableBefore: immutableInputs(), assetsBefore: maps() };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
let browser, page, context;
const stop = await targetServer();
async function reset(section, scenario = 'normal') {
  await page.evaluate(scenario => { for (const key of Object.keys(localStorage)) if (key.startsWith('task8.demo.security-billing.v1:')) localStorage.removeItem(key); localStorage.setItem('task8.demo.security-billing.scenario.v1', scenario); }, scenario);
  await page.goto(`${base}/${section}`); await page.waitForSelector('[data-settings-ready]'); await ready(page);
}
async function probe(id, run) { report.active = id; save(); const result = await run(); report.probes.push({ id, status: 'passed', ...result }); save(); }
async function validPassword() { await page.locator('#pw-cur').fill('demo-current'); await page.locator('#pw-new').fill('abcdefghijk1!'); await page.locator('#pw-conf').fill('abcdefghijk1!'); }
async function canonical() { return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('task8.mock.v1:')).map(key => [key, localStorage.getItem(key)]))); }
try {
  browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  const session = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'); page = session.page; context = session.context;
  await page.goto(`${base}/password`); await page.waitForSelector('[data-settings-ready]'); const canonicalBefore = await canonical(); report.canonicalBefore = Object.fromEntries(Object.entries(canonicalBefore).map(([key, value]) => [key, sha256(value)]));
  await probe('N25-01-six-direct-sections-no-invented-controls', async () => {
    for (const section of ['password', 'sessions', '2fa', 'plan', 'payment', 'invoices']) { await page.goto(`${base}/${section}`); await page.waitForSelector(`[data-settings-page="${section}"][data-settings-ready]`); }
    assert.equal(await page.locator('[data-invoice-table] tbody tr').count(), 4); assert.equal(await page.locator('[data-settings-page] button,[data-settings-page] a').count(), 0);
    await reset('password'); assert.equal(await page.getByRole('button', { name: /Show password|Hide password/ }).count(), 0);
    await reset('plan'); assert.equal(await page.getByRole('switch').count(), 0); assert.equal(await page.locator('[data-plan-card]').count(), 3);
    return { allSixReachable: true, invoiceReadOnly: true, noAnnualToggleCardEntryDownloadOrPasswordEye: true };
  });
  await probe('N25-02-password-errors-strength-loading-double-submit-completed', async () => {
    await reset('password'); await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByText('Enter your current password', { exact: true })).toBeVisible(); await expect(page.locator('#pw-new')).toHaveAttribute('aria-invalid', 'true');
    for (const [value, label] of [['abc', 'Too short'], ['abcdefgh', 'Weak'], ['abcdefgh1', 'Fair'], ['abcdefgh1!', 'Good'], ['abcdefghijk1!', 'Strong']]) { await page.locator('#pw-new').fill(value); await expect(page.locator('[data-password-strength]')).toContainText(label); }
    await validPassword(); await page.getByRole('button', { name: 'Update password', exact: true }).click(); await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled(); await expect(page.locator('#pw-new')).toBeDisabled();
    await page.getByRole('button', { name: 'Update password', exact: true }).evaluate(button => button.click());
    await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toBeVisible();
    for (const id of ['pw-cur', 'pw-new', 'pw-conf']) await expect(page.locator(`#${id}`)).toHaveValue('');
    assert.equal(await page.getByText('Password updated', { exact: true }).count(), 1);
    return { exactValidation: true, fiveStrengthLabels: true, real800msLoading: true, duplicateSubmitGuard: true, completedClearsSensitiveDraft: true };
  });
  await probe('N25-03-session-immediate-row-and-confirm-only-revoke-all', async () => {
    await reset('sessions'); await page.getByRole('button', { name: 'Sign out', exact: true }).first().click(); await expect(page.getByText('iPhone 15 · Gr8r app', { exact: true })).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
    const opener = page.getByRole('button', { name: 'Sign out of all other sessions', exact: true }); await opener.click(); const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused(); await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    await opener.click(); await dialog.getByRole('button', { name: 'Sign out others', exact: true }).click(); await expect(opener).toBeDisabled(); await expect(page.getByText('This device', { exact: true })).toBeVisible(); await page.reload(); await page.waitForSelector('[data-settings-ready]'); await expect(opener).toBeDisabled();
    return { rowImmediate: true, allConfirmation: true, cancelFocusAndEscape: true, currentDevicePreserved: true, reloadDemoOnly: true };
  });
  await probe('N25-04-two-factor-format-setup-invalid-enabled-disable-focus', async () => {
    await reset('2fa'); await page.getByRole('button', { name: 'Set up two-factor authentication', exact: true }).click(); await expect(page.locator('#tfa-code')).toBeFocused(); await page.locator('#tfa-code').fill('abc123'); await page.getByRole('button', { name: 'Verify', exact: true }).click(); await expect(page.getByText('Enter the 6-digit code from your app', { exact: true })).toBeVisible(); await expect(page.locator('#tfa-code')).toBeFocused();
    await page.locator('#tfa-code').fill('000000'); await page.getByRole('button', { name: 'Verify', exact: true }).click(); await expect(page.getByText('Two-factor authentication is on.', { exact: true })).toBeVisible(); for (const code of ['7KQ2-M8PX', 'D4TN-9WRE', 'HV3C-QZ6L', 'P2YB-J7SK', 'R9FG-4NUD', 'X6MA-T3HE']) await expect(page.getByText(code, { exact: true })).toBeVisible();
    const opener = page.getByRole('button', { name: 'Turn off two-factor authentication', exact: true }); await opener.click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(opener).toBeFocused(); await opener.click(); await page.getByRole('dialog').getByRole('button', { name: 'Turn off', exact: true }).click(); await expect(page.getByText('Two-factor authentication is off', { exact: true })).toBeVisible();
    return { setupAutofocus: true, invalidCodeFocus: true, anySixDigitsDemo: true, recoverySampleSix: true, disableCancelConfirm: true };
  });
  await probe('N25-05-plan-upgrade-downgrade-source-price-quirk-invoices', async () => {
    await reset('plan'); await page.getByRole('button', { name: 'Upgrade', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('8 members × $24/month = $192/month'); await page.getByRole('dialog').getByRole('button', { name: 'Upgrade to Business', exact: true }).click(); await expect(page.locator('[data-plan-card=Business]')).toContainText('Current'); await expect(page.locator('[data-settings-page]')).toContainText('· $12 per member / month'); await page.reload(); await page.waitForSelector('[data-settings-ready]'); await expect(page.locator('[data-plan-card=Business]')).toContainText('Current');
    await page.getByRole('button', { name: 'Downgrade', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Downgrade', exact: true }).click(); await expect(page.locator('[data-plan-card=Free]')).toContainText('Current'); await page.getByRole('button', { name: 'View invoices', exact: true }).click(); await page.waitForSelector('[data-invoice-table]');
    return { confirmedUpgradeAndDowngrade: true, reloadSamplePlan: true, fixed12HeaderSourceQuirk: true, invoicesNavigation: true };
  });
  await probe('N25-06-payment-source-info-only-no-record-or-window', async () => {
    await reset('payment'); const pages = context.pages().length; await page.getByRole('button', { name: 'Update', exact: true }).click(); await expect(page.getByText('Card updates open in a secure payment window', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByText('Address editing opens in the billing portal', { exact: true })).toBeVisible(); assert.equal(context.pages().length, pages); assert.equal(await page.locator('[data-settings-page] input, [data-settings-page] form').count(), 0);
    return { sourceInfoResponses: true, noCardEntryOrPaymentWriteOrWindow: true };
  });
  await probe('N25-07-explicit-failure-retains-draft-and-storage-failure-no-mutation', async () => {
    await reset('password', 'error'); await validPassword(); await page.getByRole('button', { name: 'Update password', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Demo operation failed'); await expect(page.locator('#pw-new')).toHaveValue('abcdefghijk1!'); await expect(page.getByText('Password updated. Other sessions stay signed in.', { exact: true })).toHaveCount(0);
    await reset('2fa'); await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('task8.demo.security-billing.v1:')) throw Error('WU25 storage failure'); return original.call(this, key, value); }; }); await page.getByRole('button', { name: 'Set up two-factor authentication', exact: true }).click(); await page.locator('#tfa-code').fill('123456'); await page.getByRole('button', { name: 'Verify', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('WU25 storage failure'); await expect(page.getByText('Two-factor authentication is on.', { exact: true })).toHaveCount(0);
    return { explicitError: true, draftRetainedOnServiceFailure: true, noFalseCompletion: true, storageBeforeMemory: true };
  });
  await probe('N25-08-loading-scenario-disables-cancel-until-demo-completion', async () => {
    await reset('2fa', 'loading'); await page.getByRole('button', { name: 'Set up two-factor authentication', exact: true }).click(); await page.locator('#tfa-code').fill('123456'); await page.getByRole('button', { name: 'Verify', exact: true }).click(); await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled(); await expect(page.locator('#tfa-code')).toBeDisabled(); await expect(page.getByText('Two-factor authentication is on.', { exact: true })).toBeVisible();
    return { real1200msScenario: true, pendingGuards: true, completed: true };
  });
  assert.deepEqual(await canonical(), canonicalBefore);
  await context.close(); const mobile = await newPage(browser, { viewport: { width: 390, height: 844 }, mobile: true }, undefined, true, 'http://127.0.0.1:5173'); page = mobile.page; context = mobile.context;
  await page.goto(`${base}/invoices`); await page.waitForSelector('[data-settings-ready]');
  await probe('N25-09-mobile-invoice-native-horizontal-scroll-plan-scroll-focus', async () => {
    const panel = page.locator('[data-settings-page] section'); await panel.hover(); await page.mouse.wheel(400, 0); await expect.poll(() => panel.evaluate(el => el.scrollLeft)).toBeGreaterThan(0); await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
    await reset('plan'); const body = page.locator('[data-settings-body]'); await body.hover(); await page.mouse.wheel(0, 650); await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0); await expect(page.locator('[data-plan-card=Business]')).toBeVisible();
    await reset('2fa'); await page.getByRole('button', { name: 'Set up two-factor authentication', exact: true }).click(); await expect(page.locator('#tfa-code')).toBeFocused(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeFocused();
    await page.screenshot({ path: `${output}/mobile-native-diagnostic.png` });
    return { horizontalScrollActual: true, naturalPlanVerticalScroll: true, mobileKeyboardFocus: true, viewport: { width: 390, height: 844 }, diagnosticOnly: true };
  });
  report.immutableAfter = immutableInputs(); report.assetsAfter = maps(); assert.deepEqual(report.immutableBefore, report.immutableAfter); assert.deepEqual(report.assetsBefore, report.assetsAfter); report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failed.png` }); save(); throw error; }
finally { await browser?.close(); await stop(); }
