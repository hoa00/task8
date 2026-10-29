import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { claimOutput } from '../../../../tests/frontend/output.mjs';
import { newPage } from '../../../../tests/visual/reference/environment.mjs';
const output = claimOutput(undefined, 'datamaker-dev-browser');
const origin = 'https://datamaker-task.test:1355';
const report = { status: 'running', origin, ignoreHTTPSErrors: false, probes: [], pageErrors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const width of [1440, 390]) for (const language of ['vi', 'en']) {
    const { context, page } = await newPage(browser, { viewport: { width, height: 1000 } }, undefined, true, origin);
    page.setDefaultTimeout(12000);
    page.on('pageerror', (e) => report.pageErrors.push(e.message));
    const messages = [];
    page.on('console', (msg) => messages.push(msg.text()));
    await context.addInitScript(({ language }) => {
      localStorage.setItem('task8.ui.language.v1', language);
    }, { language });
    await page.goto(origin + '/login');
    await expect(page.getByRole('img', { name: 'DataMaker Task' }).first()).toBeVisible();
    await expect(page).toHaveTitle('DataMaker Task');
    await expect(page.locator('[data-auth-subtitle]')).toHaveText(language === 'vi' ? 'Đăng nhập DataMaker Task' : 'Sign in to DataMaker Task');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Login overflow');
    await page.screenshot({ path: `${output}/login-${width}-${language}.png`, animations: 'disabled' });
    assert(messages.some(m => m.includes('[vite] connected.')), 'HMR websocket must connect through Portless');
    report.probes.push({ id: `login-brand-locale-tls-hmr-${width}-${language}`, pass: true });
    await page.goto(origin + '/onboarding?step=0');
    await expect(page).toHaveTitle('DataMaker Task');
    await expect(page.locator('[data-onboarding-step]' )).toBeVisible();
    report.probes.push({ id: `onboarding-brand-${width}-${language}`, pass: true });
    await context.close();
  }
  assert.deepEqual(report.pageErrors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack); process.exitCode = 1;
} finally {
  await browser?.close();
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
