import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { normalizeTaskView } from '../../apps/web/src/features/tasks/task-view.ts';
import { newPage } from '../visual/reference/environment.mjs';
import { claimOutput } from './output.mjs';
import { startBrowserServer } from './browser-server.mjs';
const args = process.argv.slice(2);
const output = claimOutput(args.find((a) => a.startsWith('--output='))?.slice(9), 'url-scope');
const server = await startBrowserServer({ fallback: 'shell-harness.html' });
let browser;
const report = { status: 'running', probes: [], pageErrors: [] };
async function probe(id, run) {
  const ctx = await newPage(browser, {}, undefined, true, server.origin);
  const p = ctx.page;
  p.on('pageerror', (e) => report.pageErrors.push(e.message));
  try {
    await p.goto(server.origin + '/shell-harness.html');
    await p.waitForFunction(() => window.__shellHarness);
    const ids = await p.evaluate(() => ({
      a: window.__shellHarness.workspaceA,
      b: window.__shellHarness.workspaceB,
    }));
    await run(p, ids);
    report.probes.push({ id, pass: true });
  } catch (error) {
    report.probes.push({ id, pass: false, error: String(error.stack) });
    await p.screenshot({ path: join(output, id + '.png') });
  } finally {
    await ctx.context.close();
  }
}
async function navigate(p, href) {
  await p.evaluate((href) => window.__shellHarness.navigate(href), href);
}
try {
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const route of ['tasks', 'my-tasks'])
    await probe(route + '-same-route-view-back-forward-reload', async (p, { a }) => {
      const base = `/w/${a}/${route}`;
      await navigate(p, base);
      await expect(p.locator('[data-task-row]').first()).toBeVisible();
      await p.locator('[data-list-scope]').evaluate((el) => (el.dataset.retained = 'yes'));
      const view = normalizeTaskView({ query: { q: 'NoMatchingSentinelFR02B' } });
      await navigate(p, `${base}?view=${encodeURIComponent(JSON.stringify(view))}`);
      await expect(p.locator('[data-task-row]')).toHaveCount(0);
      await expect(p.locator('[data-list-scope]')).toHaveAttribute('data-retained', 'yes');
      await p.goBack();
      await expect(p.locator('[data-task-row]').first()).toBeVisible();
      await p.goForward();
      await expect(p.locator('[data-task-row]')).toHaveCount(0);
      await p.reload();
      await expect(p.locator('[data-list-scope]')).toBeVisible();
      await expect(p.locator('[data-task-row]')).toHaveCount(0);
    });
  await probe('calendar-url-view-date-mode', async (p, { a }) => {
    const base = `/w/${a}/calendar`;
    await navigate(p, base);
    await expect(p.locator('[data-calendar-mode]')).toHaveAttribute('data-calendar-mode', 'month');
    const view = normalizeTaskView({ query: { q: 'NoMatchingSentinelFR02B' } });
    await navigate(
      p,
      `${base}?calendarDate=2026-11-01&calendarMode=week&view=${encodeURIComponent(JSON.stringify(view))}`,
    );
    await expect(p.locator('[data-calendar-mode]')).toHaveAttribute('data-calendar-mode', 'week');
    await expect(p.locator('[data-calendar-date]')).toHaveAttribute(
      'data-calendar-date',
      '2026-11-01',
    );
    await expect(p.locator('[data-calendar-count]')).toHaveAttribute('data-calendar-count', '0');
    await p.goBack();
    await expect(p.locator('[data-calendar-mode]')).toHaveAttribute('data-calendar-mode', 'month');
    await p.goForward();
    await expect(p.locator('[data-calendar-mode]')).toHaveAttribute('data-calendar-mode', 'week');
    await p.reload();
    await expect(p.locator('[data-calendar-date]')).toHaveAttribute(
      'data-calendar-date',
      '2026-11-01',
    );
  });
  await probe('project-create-default-and-menu-cannot-cross-workspace', async (p, { a, b }) => {
    await navigate(p, `/w/${a}/tasks`);
    await p
      .getByRole('button', { name: /^(New task|Công việc mới)$/ })
      .first()
      .click();
    await expect(p.locator('[data-task-form]')).toBeVisible();
    await navigate(p, `/w/${b}/home`);
    await expect(p.locator('.shell-layout')).toHaveAttribute('data-workspace-id', b);
    await expect(p.locator('[data-task-form]')).toHaveCount(0);
    await navigate(p, `/w/${a}/tasks`);
    await expect(p.locator('[data-task-form]')).toHaveCount(0);
    await p.locator('[data-task-row]').first().click({ button: 'right' });
    await expect(p.getByRole('menu')).toBeVisible();
    await navigate(p, `/w/${b}/home`);
    await expect(p.getByRole('menu')).toHaveCount(0);
  });
  await probe('Search-Overdue-same-route', async (p, { a }) => {
    await navigate(p, `/w/${a}/tasks`);
    await expect(p.locator('[data-task-row]').first()).toBeVisible();
    await p.keyboard.press('/');
    await expect(p.locator('[data-palette-item="suggested:overdue"]')).toBeVisible();
    await p.locator('[data-palette-item="suggested:overdue"]').click();
    await expect.poll(() => new URL(p.url()).searchParams.get('view')).toContain('overdue');
    const ids = await p
      .locator('[data-task-row]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-task-row')));
    assert.ok(ids.length > 0);
    const tasks = await p.evaluate(
      async ({ ids, a }) =>
        Promise.all(
          ids.map(
            async (taskId) =>
              (await window.__shellHarness.client.api.getTask({ workspaceId: a, taskId })).data
                .task,
          ),
        ),
      { ids, a },
    );
    assert.ok(
      tasks.every((task) => task.status !== 'done' && task.dueDate && task.dueDate < '2026-10-08'),
    );
  });
  await probe('late-create-cannot-close-or-navigate-new-workspace-draft', async (p, { a, b }) => {
    await p.evaluate(() => window.__shellHarness.enableWritableB());
    await navigate(p, `/w/${a}/tasks`);
    await p
      .getByRole('button', { name: /^(New task|Công việc mới)$/ })
      .first()
      .click();
    await p.locator('[data-task-form] input').first().fill('Held A create');
    await p.evaluate(() => window.__shellHarness.holdNextCreate());
    await p.getByRole('button', { name: /^(Create task|Tạo công việc)$/ }).click();
    await p.waitForFunction(() => window.__shellHarness.createIsHeld());
    await navigate(p, `/w/${b}/home`);
    await expect(p.locator('[data-task-form]')).toHaveCount(0);
    await p.locator('.shell-create').click();
    await p.getByRole('menuitem').first().click();
    await p.locator('[data-task-form] input').first().fill('B draft');
    await p.evaluate(() => window.__shellHarness.releaseCreate());
    await p.waitForFunction(() => window.__shellHarness.completedCreates() === 1);
    await expect(p.locator('.shell-layout')).toHaveAttribute('data-workspace-id', b);
    await expect(p.locator('[data-task-form] input').first()).toHaveValue('B draft');
    assert.ok(new URL(p.url()).pathname.includes(b));
  });
  assert.deepEqual(report.pageErrors, []);
  report.status = report.probes.every((p) => p.pass) ? 'passed' : 'failed';
  if (report.status === 'failed') process.exitCode = 1;
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.stop();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.map((p) => ({ id: p.id, pass: p.pass, error: p.error?.slice(0, 180) })),
    }),
  );
}
