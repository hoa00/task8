import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets } from '../settings/assets.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-26/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required');
fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets() });
const report = { status: 'running', runtime: { node: process.version, ...environment }, probes: [], assetsBefore: assets(), immutableBefore: immutableInputs(), scope: 'Native Target controls/routes/timers in isolated Mock mode. Transient sample credential drafts only; no password authentication/provider/email/backend or raster claim.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
let browser, page, clockContext, clockInstalled = false, clockRound = 0; const stop = await targetServer();
async function entry(path) { if (clockInstalled) await page.clock.resume(); await page.goto(`http://127.0.0.1:5173${path}`); await page.waitForSelector('[data-auth-layout]'); await ready(page); if (clockInstalled) await page.clock.pauseAt(new Date(Date.parse(environment.clock) + ++clockRound * 3600000)); }
async function probe(id, run) { report.active = id; save(); const details = await run(); report.probes.push({ id, status: 'passed', ...details }); save(); console.log(`${id}: passed`); }
async function paused() { await page.clock.install({ time: new Date(environment.clock) }); clockInstalled = true; await page.clock.pauseAt(new Date(Date.parse(environment.clock) + 60000)); }
async function storage() { return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'task8.ui.theme.v1'))); }
try {
  browser = await chromium.launch({ args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  ({ page, context: clockContext } = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'));
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await probe('N26-01-direct-reload-aliases', async () => {
    const paths = ['/login', '/signup', '/forgot-password', '/forgot-password?state=sent', '/reset-password', '/reset-password?state=done', '/verify-email'];
    for (const path of paths) { await entry(path); await expect(page.locator('[data-auth-card]')).toHaveCount(1); await page.reload(); await expect(page.locator('[data-auth-card]')).toHaveCount(1); assert.equal(await page.locator('[data-sidebar]').count(), 0); }
    const aliases = { login: '/login', signup: '/signup', forgot: '/forgot-password', reset: '/reset-password', verify: '/verify-email', onboarding: '/onboarding?step=0' };
    for (const [alias, canonical] of Object.entries(aliases)) { await page.goto(`http://127.0.0.1:5173/#${alias}`); await expect(page).toHaveURL(`http://127.0.0.1:5173${canonical}`); }
    await expect(page.getByText('Pending · WU-27 owns the six-step onboarding flow.')).toBeVisible();
    for (const path of ['/forgot-password?state=invalid', '/reset-password?state=sent']) { await entry(path); assert.equal(new URL(page.url()).search, ''); }
    return { direct: 7, reload: 7, aliases: 6, invalid: 2, outsideShell: true, onboardingOwner: 'WU-27' };
  });
  await probe('N26-02-validation-reveal-remember', async () => {
    await entry('/login'); const before = await storage(); await page.locator('#l-email').fill(''); await page.locator('#l-pw').fill('sample-draft'); await page.locator('#login-btn').click();
    await expect(page.locator('#l-email')).toBeFocused(); await expect(page.locator('#l-pw')).toHaveValue('');
    await page.locator('#l-email').fill('demo@example.com'); await page.locator('#login-btn').click(); await expect(page.locator('#l-pw')).toBeFocused();
    await page.locator('#l-rem').uncheck(); await page.locator('#l-email').fill('draft-change@example.com'); await page.locator('#l-pw').fill('sample-draft'); await page.getByRole('button', { name: 'Show password' }).click(); await expect(page.locator('#l-pw')).toHaveAttribute('type', 'text'); await expect(page.locator('#l-pw')).toHaveValue('sample-draft'); await expect(page.locator('#l-pw')).toBeFocused(); await expect(page.locator('#l-rem')).toBeChecked(); await expect(page.locator('#l-email')).toHaveValue('demo@example.com');
    await page.getByRole('button', { name: 'Hide password' }).click(); await page.locator('#l-rem').uncheck(); assert.deepEqual(await storage(), before);
    await page.reload(); await expect(page.locator('#l-pw')).toHaveValue(''); await expect(page.locator('#l-rem')).toBeChecked(); await expect(page.locator('#l-email')).toHaveValue('hello@gr8rstudio.com');
    return { emailFocus: true, passwordFocus: true, revealRetainsDraft: true, rememberEphemeral: true, storageUnchanged: true };
  });
  await probe('N26-03-login-timing-and-cancel', async () => {
    await entry('/login'); await paused(); const before = await storage(); await page.locator('#l-pw').fill('sample-pending'); await page.locator('#l-pw').press('Enter'); await expect(page.locator('#login-btn')).toHaveAttribute('aria-busy', 'true'); await expect(page.locator('#l-pw')).toBeEnabled();
    await page.clock.runFor(749); assert.equal(new URL(page.url()).pathname, '/login'); await page.clock.runFor(1); await expect(page).toHaveURL(/\/w\/[^/]+\/home$/);
    assert.equal(JSON.stringify(await storage()).includes('sample-pending'), false); await expect(page.locator('[data-auth-live]')).toHaveCount(0);
    await entry('/login'); await page.locator('#l-pw').fill('sample-cancel'); await page.locator('#login-btn').click(); await page.getByRole('button', { name: 'Forgot password?', exact: true }).click(); await page.clock.runFor(1000); await expect(page).toHaveURL(/\/forgot-password$/);
    return { transitionAtMilliseconds: 750, keyboardEnterSubmit: true, authLiveRegionCleaned: true, pendingInputsEditable: true, staleCompletionCancelled: true, noCredentialStorage: true, storageBeforeCount: Object.keys(before).length };
  });
  await probe('N26-04-signup-validation-and-cooldown', async () => {
    await entry('/signup'); await page.locator('#signup-btn').click(); await expect(page.getByText('Enter your name', { exact: true })).toBeVisible(); await expect(page.locator('#signup-btn')).toBeFocused(); assert.equal(await page.getByRole('button', { name: 'Show password' }).count(), 0);
    await page.locator('#s-name').fill('  Demo Person  '); await page.locator('#s-email').fill('bad'); await page.locator('#s-pw').fill('abc'); await page.locator('#s-pw').press('Enter'); await expect(page.locator('#s-pw')).toBeFocused(); await expect(page.locator('#s-name')).toHaveValue('Demo Person'); await expect(page.locator('#s-email')).toHaveValue('bad'); await expect(page.locator('#s-pw')).toHaveValue('abc'); assert.equal(await page.locator('#s-pw').evaluate(el => el.selectionStart), 3);
    await page.locator('#s-name').fill('Demo Person'); await page.locator('#s-email').fill('demo@example.com'); await page.locator('#s-pw').fill('abcdefghijk1!'); await page.locator('#signup-btn').click(); await page.clock.runFor(799); await expect(page).toHaveURL(/\/signup$/); await page.clock.runFor(1); await expect(page).toHaveURL(/\/verify-email$/); await expect(page.locator('#resend-t')).toHaveText('30'); await expect(page.locator('#resend-btn')).toBeDisabled();
    await page.clock.runFor(29000); await expect(page.locator('#resend-t')).toHaveText('1'); await page.clock.runFor(1000); await expect(page.locator('#resend-btn')).toBeEnabled(); await page.locator('#resend-btn').click(); await expect(page.locator('#resend-t')).toHaveText('30'); await expect(page.getByText('Demo verification link requested. No email is delivered.')).toBeVisible();
    await page.getByRole('button', { name: 'Change it', exact: true }).click(); await expect(page).toHaveURL(/\/signup$/); await expect(page.locator('#s-email')).toHaveValue(''); await expect(page.locator('#s-pw')).toHaveValue(''); await expect(page.locator('#s-name')).toHaveValue('Demo Person');
    return { signupAtMilliseconds: 800, resendSeconds: 30, noEmailDelivery: true, changeEmailResetsPassword: true };
  });
  await probe('N26-05-forgot-reset-result-history', async () => {
    await entry('/forgot-password'); await page.locator('#f-email').fill('bad'); await page.locator('#forgot-btn').click(); await expect(page.getByText('Enter the email you use to sign in')).toBeVisible();
    await page.locator('#f-email').fill('demo@example.com'); await page.locator('#forgot-btn').click(); await page.clock.runFor(699); await expect(page).toHaveURL(/\/forgot-password$/); await page.clock.runFor(1); await expect(page).toHaveURL(/state=sent$/);
    await page.getByRole('button', { name: 'Open reset link' }).click(); await page.clock.runFor(20); await expect(page.locator('#r-pw')).toBeFocused();
    await page.locator('#r-pw').fill('abc'); await page.locator('#r-pw2').fill('different'); await page.locator('#reset-btn').click(); await expect(page.locator('#reset-btn')).toBeFocused(); await expect(page.locator('#r-pw2')).toHaveValue(''); await expect(page.locator('#r-pw')).toHaveValue('abc'); await expect(page.getByText("Passwords don't match")).toBeVisible();
    await page.locator('#r-pw').fill('abcdefghijk1!'); await page.locator('#r-pw2').fill('abcdefghijk1!'); await page.locator('#reset-btn').click(); await page.clock.runFor(699); await expect(page).toHaveURL(/\/reset-password$/); await page.clock.runFor(1); await expect(page).toHaveURL(/state=done$/);
    await page.goBack(); await expect(page.locator('#r-pw')).toHaveValue(''); await page.goForward(); await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible(); await page.reload(); await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    return { forgotAtMilliseconds: 700, resetAtMilliseconds: 700, resetConfirmationSourceClear: true, backForwardReload: true, noDraftInUrl: !/demo@|abcdefgh|password=/.test(page.url()) };
  });
  await probe('N26-06-social-timing-and-onboarding', async () => {
    for (const provider of ['Google', 'Microsoft', 'Apple']) { await entry('/login'); await page.getByRole('button', { name: `Continue with ${provider}` }).click(); await page.clock.runFor(799); await expect(page).toHaveURL(/\/login$/); await page.clock.runFor(1); await expect(page).toHaveURL(/\/w\/[^/]+\/home$/); }
    await entry('/verify-email'); await page.getByRole('button', { name: "I've verified my email" }).click(); await expect(page).toHaveURL(/\/onboarding\?step=0$/); await expect(page.getByText('Pending · WU-27 owns the six-step onboarding flow.')).toBeVisible();
    return { providers: 3, socialAtMilliseconds: 800, pendingOwner: 'WU-27' };
  });
  await probe('N26-07-mobile-scroll-footer', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await entry('/signup');
    const scroller = page.locator('[data-auth-layout]');
    const before = await scroller.evaluate(el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    await page.clock.resume(); await page.mouse.move(195, 600); await page.mouse.wheel(0, 700); await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const after = await scroller.evaluate(el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    assert.ok(after.scrollTop > 0); await expect(page.getByText('© 2026 Gr8r Studio · Terms · Privacy', { exact: true })).toBeInViewport();
    await page.locator('#signup-btn').click(); const afterValidation = await scroller.evaluate(el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })); assert.equal(afterValidation.scrollTop, 0); await expect(page.locator('#signup-btn')).toBeFocused();
    return { before, after, afterValidation, validationScrollReset: true, footerReachable: true, actualWheel: true, scope: 'Long signup Auth viewport clips offscreen footer at top; actual wheel reaches it, Source-style full presentation validation resets scroll while retaining submit focus.' };
  });
  assert.deepEqual(errors, []); report.errors = errors; report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await clockContext?.close(); await browser?.close(); await stop(); }
