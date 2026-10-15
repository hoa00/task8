import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { newPage } from '../visual/reference/environment.mjs';
import { claimOutput } from './output.mjs';
import { withBrowserSession } from './browser-session.mjs';
const args = process.argv.slice(2),
  value = (key) =>
    args
      .find((arg) => arg.startsWith('--' + key + '='))
      ?.split('=')
      .slice(1)
      .join('=');
const output = claimOutput(value('output'), 'accessibility'),
  report = { status: 'running', probes: [], pageErrors: [] };
let browser, server, appServer;
async function probe(id, mode, run) {
  const ctx = await newPage(browser, {}, undefined, true, server.origin),
    p = ctx.page;
  p.setDefaultTimeout(8000);
  p.on('pageerror', (error) => report.pageErrors.push({ id, message: error.message }));
  try {
    if (mode === 'primitive') {
      await p.goto(server.origin + '/controls.html');
      await p.getByLabel('Group', { exact: true }).selectOption('accessibility');
      await expect(p.locator('[data-accessibility-gallery]')).toBeVisible();
    } else {
      await p.goto(server.origin + '/shell-harness.html');
      await p.waitForFunction(() => window.__shellHarness);
      await p.evaluate(() => window.__shellHarness.setLocale('en'));
    }
    let timer;
    try {
      await Promise.race([
        run(p),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Scenario timed out')), 35000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    report.probes.push({ id, pass: true });
  } catch (error) {
    report.probes.push({ id, pass: false, error: String(error.stack) });
    await p.screenshot({ path: join(output, id + '.png') });
  } finally {
    await ctx.context.close();
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
const navigate = (p, href) =>
  p.evaluate((href) => {
    void window.__shellHarness.navigate(href);
  }, href);
const workspace = (p) => p.evaluate(() => window.__shellHarness.workspaceA);
try {
  await withBrowserSession(
    {
      servers: [
        { directory: value('directory') ?? 'apps/web/dist', fallback: 'shell-harness.html' },
        { directory: value('directory') ?? 'apps/web/dist', fallback: 'index.html' },
      ],
    },
    async (resources) => {
      browser = resources.browser;
      [server, appServer] = resources.servers;
      report.browser = browser.version();
      if (value('only') !== 'consumers') {
        await probe('field-label-hint-error-select-and-literal-text', 'primitive', async (p) => {
          const input = p.getByRole('textbox', { name: 'Home', exact: true });
          await expect(input).toHaveAccessibleDescription('Home');
          await p
            .locator('label')
            .filter({ hasText: /^Home$/ })
            .click();
          await expect(input).toBeFocused();
          await p.getByRole('button', { name: 'Toggle binding error' }).click();
          await expect(input).toHaveAttribute('aria-invalid', 'true');
          await expect(input).toHaveAccessibleDescription('Home');
          const relation = await input.evaluate((el) => ({
            description: el.getAttribute('aria-describedby'),
            error: el.getAttribute('aria-errormessage'),
            label: el.getAttribute('aria-labelledby'),
          }));
          assert.equal(relation.description, relation.error);
          assert(relation.label);
          const select = p.getByRole('button', { name: 'Select binding', exact: true });
          await expect(select).toHaveAccessibleDescription('Select hint');
          await expect(p.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
          await expect(p.getByRole('tab', { name: 'Home', exact: true })).toBeVisible();
          await expect(p.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
          await expect(
            p.getByRole('button', { name: 'Internal dismiss', exact: true }),
          ).toBeVisible();
          await expect(p.getByText('UNEXPECTED TRANSLATION', { exact: true })).toHaveCount(0);
        });
        await probe(
          'dialog-tab-order-roving-groups-nested-escape-and-missing-opener',
          'primitive',
          async (p) => {
            await p.getByRole('button', { name: 'Open focus matrix' }).click();
            const dialog = p.getByRole('dialog', { name: 'Focus matrix', exact: true });
            await expect(dialog.getByRole('button', { name: 'Programmatic only' })).toBeFocused();
            await p.keyboard.press('Tab');
            await expect(dialog.getByRole('tab', { name: 'Beta', exact: true })).toBeFocused();
            await p.keyboard.press('ArrowRight');
            await expect(dialog.getByRole('tab', { name: 'Gamma', exact: true })).toBeFocused();
            await expect(dialog.getByRole('tab', { name: 'Gamma', exact: true })).toHaveAttribute(
              'aria-selected',
              'true',
            );
            await p.keyboard.press('Home');
            await expect(dialog.getByRole('tab', { name: 'Alpha', exact: true })).toBeFocused();
            await p.keyboard.press('Tab');
            await expect(dialog.getByRole('radio', { name: 'Alpha', exact: true })).toBeFocused();
            await p.keyboard.press('End');
            await expect(dialog.getByRole('radio', { name: 'Gamma', exact: true })).toHaveAttribute(
              'aria-checked',
              'true',
            );
            await p.keyboard.press('Tab');
            await expect(dialog.getByRole('textbox', { name: 'Matrix text' })).toBeFocused();
            await dialog.getByRole('button', { name: 'Close matrix' }).focus();
            await p.keyboard.press('Tab');
            await expect(dialog.getByRole('tab', { name: 'Alpha', exact: true })).toBeFocused();
            await p.keyboard.press('Shift+Tab');
            await expect(dialog.getByRole('button', { name: 'Close matrix' })).toBeFocused();
            await dialog.getByRole('button', { name: 'Nested popup' }).click();
            await expect(p.getByRole('button', { name: 'Popup action' })).toBeFocused();
            await p.keyboard.press('Escape');
            await expect(p.getByRole('button', { name: 'Popup action' })).toHaveCount(0);
            await expect(dialog).toBeVisible();
            await dialog.getByRole('button', { name: 'Remove opener' }).click();
            await p.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            await expect(p.getByRole('button', { name: 'After dialog' })).toBeFocused();
          },
        );
      }
      if (value('only') !== 'consumers')
        await probe('reduced-motion-keeps-dialog-dom-draft-and-focus', 'primitive', async (p) => {
          await p.emulateMedia({ reducedMotion: 'reduce' });
          await p.evaluate(() => {
            window.__motionFrames = [];
            const observer = new MutationObserver(() => {
              const node = document.querySelector('.ui-dialog');
              if (node) {
                const css = getComputedStyle(node);
                window.__motionFrames.push({
                  name: css.animationName,
                  duration: css.animationDuration,
                });
                observer.disconnect();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
          });
          await p.getByRole('button', { name: 'Open focus matrix' }).click();
          await p.waitForFunction(() => window.__motionFrames.length);
          const frame = await p.evaluate(() => window.__motionFrames[0]);
          assert.equal(frame.name, 'fadeOnly');
          assert.equal(frame.duration, '0.12s');
          const dialog = p.getByRole('dialog', { name: 'Focus matrix', exact: true });
          await dialog.evaluate((node) => (node.dataset.retained = 'yes'));
          const input = dialog.getByRole('textbox', { name: 'Matrix text' });
          await input.fill('Keep this draft');
          await expect(dialog).toHaveAttribute('data-entered', '');
          await expect(dialog).toHaveAttribute('data-retained', 'yes');
          await expect(input).toHaveValue('Keep this draft');
          await expect(input).toBeFocused();
        });
      await probe(
        'project-form-field-relations-keyboard-template-and-error-focus',
        'consumer',
        async (p) => {
          const a = await workspace(p);
          await navigate(p, `/w/${a}/projects`);
          await p.getByRole('button', { name: 'New project', exact: true }).first().click();
          const dialog = p.locator('[data-project-form]');
          await expect(dialog).toBeVisible();
          const bindings = await dialog.locator('label[for]').evaluateAll((labels) =>
            labels.map((label) => ({
              label: label.textContent,
              id: label.htmlFor,
              exists: !!document.getElementById(label.htmlFor),
              named: [...(document.getElementById(label.htmlFor)?.labels ?? [])].includes(label),
            })),
          );
          assert(bindings.length >= 4);
          assert(
            bindings.every((row) => row.exists && row.named),
            JSON.stringify(bindings),
          );
          const name = dialog.getByRole('textbox', { name: 'Project name', exact: true });
          await name.fill('');
          await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
          await expect(name).toBeFocused();
          await expect(name).toHaveAttribute('aria-invalid', 'true');
          await expect(name).toHaveAccessibleDescription('Give the project a name');
          const templates = dialog.getByRole('radiogroup', { name: 'Template', exact: true });
          await templates.getByRole('radio').first().focus();
          await p.keyboard.press('End');
          await expect(templates.getByRole('radio').last()).toBeFocused();
          await expect(templates.getByRole('radio').last()).toHaveAttribute('aria-checked', 'true');
        },
      );
      await probe(
        'appearance-choice-keyboard-and-locale-message-lifetime',
        'consumer',
        async (p) => {
          const a = await workspace(p);
          await navigate(p, `/w/${a}/settings/appearance`);
          await expect(p.locator('[data-settings-ready]')).toBeVisible();
          const theme = p.getByRole('radiogroup', { name: 'Theme', exact: true });
          await theme.getByRole('radio').first().focus();
          await p.keyboard.press('ArrowRight');
          await expect(theme.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
          await expect(theme.getByRole('radio').nth(1)).toBeFocused();
          const accents = p.getByRole('radiogroup', { name: 'Accent color', exact: true });
          await accents.getByRole('radio').first().focus();
          await p.keyboard.press('End');
          await expect(accents.getByRole('radio').last()).toHaveAttribute('aria-checked', 'true');
          await expect(accents.getByRole('radio').last()).toBeFocused();
          await navigate(p, `/w/${a}/notifications`);
          await p.getByRole('button', { name: 'Mark all as read', exact: true }).click();
          const toast = p
            .locator('[data-overlay-notification]')
            .filter({ hasText: "You're all caught up." });
          await expect(toast).toBeVisible();
          await toast.hover();
          await p.evaluate(() => window.__shellHarness.setLocale('vi'));
          await expect(toast).toContainText("You're all caught up.");
          await expect(
            p.getByRole('button', { name: 'Đóng thông báo', exact: true }),
          ).toBeVisible();
          await navigate(p, `/w/${a}/inbox`);
          await expect(p.getByRole('tab', { name: /Tất cả/ })).toBeVisible();
          await p.evaluate(() => window.__shellHarness.setLocale('en'));
          await expect(p.getByRole('tab', { name: /All/ })).toBeVisible();
        },
      );
      await probe('vietnamese-form-binding-and-mobile-layout', 'consumer', async (p) => {
        const a = await workspace(p);
        await p.evaluate(() => window.__shellHarness.setLocale('vi'));
        await navigate(p, `/w/${a}/projects`);
        await p.getByRole('button', { name: 'Dự án mới', exact: true }).first().click();
        const dialog = p.locator('[data-project-form]');
        await p.waitForFunction(() => {
          const node = document.querySelector('[data-project-form]');
          return (
            node && node.getAnimations().every((animation) => animation.playState === 'finished')
          );
        });
        const name = dialog.getByRole('textbox', { name: 'Tên dự án', exact: true });
        await name.fill('Home');
        await expect(name).toHaveValue('Home');
        await dialog.screenshot({ path: join(output, 'project-form-vi-desktop.png') });
        await p.setViewportSize({ width: 390, height: 844 });
        await p.evaluate(() => document.fonts.ready);
        const bounds = await dialog.boundingBox();
        assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, JSON.stringify(bounds));
        assert(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth));
        await expect(name).toHaveValue('Home');
        await dialog.screenshot({ path: join(output, 'project-form-vi-mobile.png') });
      });
      await probe('onboarding-card-keyboard-field-error-and-focus', 'consumer', async (p) => {
        await p.context().addInitScript(() => localStorage.setItem('task8.ui.language.v1', 'en'));
        await p.goto(appServer.origin + '/onboarding');
        if (await p.getByRole('button', { name: 'Open demo', exact: true }).count())
          await p.getByRole('button', { name: 'Open demo', exact: true }).click();
        const group = p.getByRole('radiogroup', { name: 'Use case', exact: true });
        await group.getByRole('radio').first().focus();
        await p.keyboard.press('End');
        await expect(group.getByRole('radio').last()).toHaveAttribute('aria-checked', 'true');
        await expect(group.getByRole('radio').last()).toBeFocused();
        await p.getByRole('button', { name: 'Continue', exact: true }).click();
        const name = p.getByRole('textbox', { name: 'Workspace name', exact: true });
        await name.fill('');
        await p.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(name).toBeFocused();
        await expect(name).toHaveAccessibleDescription('Name your workspace to continue');
        await expect(name).toHaveAttribute('aria-invalid', 'true');
      });
      report.status =
        report.probes.every((row) => row.pass) && !report.pageErrors.length ? 'passed' : 'failed';
    },
  );
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack);
  throw error;
} finally {
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
