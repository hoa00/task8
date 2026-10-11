import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
const workspaceId = '01a11abd-aa80-72ea-8b87-b31ad015a24e';
const root = `/w/${workspaceId}`;
const output = resolve(process.env.I18N_EVIDENCE_DIR ?? 'docs/poc/evidence/i18n');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [mode, baseURL] of [['mock', process.env.I18N_MOCK_URL ?? 'http://127.0.0.1:5173'], ['http', process.env.I18N_HTTP_URL ?? 'http://127.0.0.1:5175']]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const language = async value => {
      await page.getByRole('button', { name: /^(Ngôn ngữ|Language)$/ }).click();
      await expect(page.getByRole('option')).toHaveText(['Tiếng Việt', 'English']);
      await page.getByRole('option', { name: value, exact: true }).click();
    };
    await page.goto(`${root}/settings/language`);
    await expect(page.locator('[data-settings-ready]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { name: 'Ngôn ngữ', exact: true })).toBeVisible();
    if (mode === 'http') {
      const preferences = `${baseURL}/api/v1/workspaces/${workspaceId}/me/preferences`;
      const before = await (await context.request.get(`${baseURL}/api/v1/workspaces/${workspaceId}/bootstrap`)).json();
      await page.route('**/me/preferences', async route => {
        if (route.request().method() === 'PATCH') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Settings could not be saved' } }) });
        else await route.continue();
      });
      await language('English');
      await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
      assert.equal((await (await context.request.get(preferences)).json()).data.lang, 'vi');
      await page.unroute('**/me/preferences');
      await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      const after = await (await context.request.get(`${baseURL}/api/v1/workspaces/${workspaceId}/bootstrap`)).json();
      before.data.preferences.lang = 'en';
      assert.deepEqual(after, before, 'Changing language preserves all canonical workspace data');
      assert.equal((await (await context.request.get(preferences)).json()).data.lang, 'en');
    } else await language('English');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-settings-ready]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.screenshot({ animations: 'disabled', path: resolve(output, `${mode}-en-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator('.shell-sidebar').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    await page.screenshot({ animations: 'disabled', path: resolve(output, `${mode}-en-mobile.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await language('Tiếng Việt');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.reload();
    await expect(page.locator('[data-settings-ready]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.screenshot({ animations: 'disabled', path: resolve(output, `${mode}-vi-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator('.shell-sidebar').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    await page.screenshot({ animations: 'disabled', path: resolve(output, `${mode}-vi-mobile.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const routes = ['home', 'tasks', 'projects', 'calendar', 'timeline', 'members', 'teams', 'inbox', 'activity', 'archive', 'settings/appearance', 'settings/datetime', 'settings/profile', 'settings/preferences', 'settings/shortcuts', 'settings/plan'];
    for (const route of routes) {
      await page.goto(`${root}/${route}`);
      await expect(page.locator('.shell-layout')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
      await expect(page.locator('#main-content')).not.toBeEmpty();
      await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
      if (route === 'settings/plan') await expect(page.getByText('Miễn phí', { exact: true })).toBeVisible();
      if (route === 'members') await expect(page.getByRole('button', { name: 'Vai trò của Tanjim Islam', exact: true })).toContainText('Chủ sở hữu');
      if (route === 'tasks') {
        await expect(page.getByRole('table', { name: 'Công việc', exact: true })).toBeVisible();
        await page.screenshot({ animations: 'disabled', path: resolve(output, `${mode}-vi-tasks.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    results.push({ mode, status: 'PASS', default: 'vi', choices: ['vi', 'en'], persistence: 'both languages after reload', routes, screenshots: 5, failuresPreserveLanguage: mode === 'http' });
    await context.close();
  }
  await writeFile(resolve(output, 'browser.json'), JSON.stringify({ results }, null, 2) + '\n');
  console.log(JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
