import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { newPage } from '../visual/reference/environment.mjs';
import { claimOutput } from './output.mjs';
import { startBrowserServer } from './browser-server.mjs';
const output = claimOutput(
  process.argv.find((arg) => arg.startsWith('--output='))?.slice(9),
  'controllers',
);
const report = { status: 'running', probes: [], pageErrors: [] };
const server = await startBrowserServer({ fallback: 'shell-harness.html' });
let browser;
async function probe(id, run) {
  const ctx = await newPage(browser, {}, undefined, true, server.origin),
    p = ctx.page;
  p.setDefaultTimeout(7000);
  p.on('pageerror', (error) => report.pageErrors.push(error.message));
  try {
    await p.goto(server.origin + '/shell-harness.html');
    await p.waitForFunction(() => window.__shellHarness);
    const a = await p.evaluate(() => window.__shellHarness.workspaceA);
    await p.evaluate(() => window.__shellHarness.setLocale('en'));
    let timer;
    try {
      await Promise.race([
        run(p, a),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Scenario timed out')), 30000);
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
const count = (p, id) =>
  p.evaluate((id) => window.__shellHarness.requests().filter((row) => row.id === id).length, id);
try {
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  await probe('settings-no-catalogue-home-one-complete-loader', async (p, a) => {
    await navigate(p, `/w/${a}/settings/profile`);
    await expect(p.locator('[data-settings-ready]')).toBeVisible();
    assert.equal(await count(p, 'listTasks'), 0);
    assert.equal(await count(p, 'getTaskSummary'), 0);
    await navigate(p, `/w/${a}/home`);
    await expect(p.locator('[data-home]')).toBeVisible();
    await expect.poll(() => count(p, 'getTaskSummary')).toBe(1);
    assert.equal(await count(p, 'listTasks'), 1);
  });
  await probe('drawer-by-id-catalogue-only-for-dependency-editor', async (p, a) => {
    await navigate(p, `/w/${a}/settings/profile`);
    await expect(p.locator('[data-settings-ready]')).toBeVisible();
    const task = await p.evaluate(async () => {
      const h = window.__shellHarness;
      return (await h.client.api.listTasks({ workspaceId: h.workspaceA, query: { limit: 1 } })).data
        .items[0];
    });
    await p.evaluate(() => window.__shellHarness.clearRequests());
    await navigate(p, `/w/${a}/settings/profile?taskId=${task.id}`);
    await expect(p.locator('[data-task-drawer]')).toBeVisible();
    await expect.poll(() => count(p, 'getTask')).toBeGreaterThan(0);
    assert.equal(await count(p, 'listTasks'), 0);
    const deps = p
      .locator('[data-task-drawer] dt')
      .filter({ hasText: 'Blocked by' })
      .locator('xpath=following-sibling::dd[1]')
      .getByRole('button')
      .first();
    await deps.click();
    await expect.poll(() => count(p, 'listTasks')).toBe(1);
  });
  for (const code of ['FORBIDDEN', 'NOT_FOUND', 'INTERNAL_ERROR'])
    await probe('notifications-linked-task-' + code.toLowerCase(), async (p, a) => {
      const linked = await p.evaluate(async (code) => {
        const h = window.__shellHarness,
          rows = (
            await h.client.api.listNotifications({
              workspaceId: h.workspaceA,
              query: { limit: 200 },
            })
          ).data.items;
        const item = rows.find((row) => row.taskId);
        if (!item) throw Error('Missing linked notification fixture');
        h.failLinkedTask(item.taskId, code);
        return { id: item.id, taskId: item.taskId };
      }, code);
      await navigate(p, `/w/${a}/notifications`);
      await expect(p.locator('[data-notifications-ready]')).toBeVisible();
      await expect(p.locator(`[data-notification-id="${linked.id}"]`)).toBeVisible();
      await expect(p.getByText('QA linked task unavailable', { exact: true })).toHaveCount(0);
      await navigate(p, `/w/${a}/inbox`);
      await expect(p.locator('[data-notifications-ready]')).toBeVisible();
      await expect(p.locator(`[data-notification-id="${linked.id}"]`)).toBeVisible();
    });
  await probe(
    'project-render-is-read-only-and-late-saved-view-keeps-url-preference',
    async (p, a) => {
      await navigate(p, `/w/${a}/settings/profile`);
      await expect(p.locator('[data-settings-ready]')).toBeVisible();
      const fixture = await p.evaluate(async () => {
        const h = window.__shellHarness,
          data = (await h.client.api.getBootstrap({ workspaceId: h.workspaceA })).data,
          project = data.projects.find((row) => row.access === 'allowed').project;
        const saved = (
          await h.client.api.createSavedView({
            workspaceId: h.workspaceA,
            projectId: project.id,
            body: {
              name: 'FR04 Async',
              type: 'list',
              filters: [{ field: 'priority', op: 'is', values: ['high'] }],
            },
          })
        ).data;
        const task = (
          await h.client.api.createTask({
            workspaceId: h.workspaceA,
            body: {
              projectId: project.id,
              title: 'FR04 Personal override',
              priority: 'low',
              clientRequestId: crypto.randomUUID(),
            },
          })
        ).data.task;
        window.__preferenceWrites = [];
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('task8.ui.project-view.v1:')) window.__preferenceWrites.push(key);
          return set.call(this, key, value);
        };
        h.holdSavedViews();
        return { projectId: project.id, savedId: saved.id, taskId: task.id, title: task.title };
      });
      const path = `/w/${a}/projects/${fixture.projectId}/views/${fixture.savedId}`;
      await navigate(p, path);
      await expect.poll(() => count(p, 'listSavedViews')).toBeGreaterThan(0);
      await expect(p.locator('[data-settings-ready]')).toBeVisible();
      await navigate(
        p,
        path +
          '?view=' +
          encodeURIComponent(JSON.stringify({ query: { q: fixture.title, filters: [] } })),
      );
      await p.evaluate(() => window.__shellHarness.releaseSavedViews());
      await expect(p.locator(`[data-task-row="${fixture.taskId}"]`)).toBeVisible();
      assert.deepEqual(await p.evaluate(() => window.__preferenceWrites), []);
    },
  );
  for (const consumer of ['list', 'table', 'drawer'])
    await probe('date-policy-' + consumer, async (p, a) => {
      const task = await p.evaluate(async (consumer) => {
        const h = window.__shellHarness,
          bootstrap = (await h.client.api.getBootstrap({ workspaceId: h.workspaceA })).data,
          project = bootstrap.projects.find((row) => row.access === 'allowed').project;
        return (
          await h.client.api.createTask({
            workspaceId: h.workspaceA,
            body: {
              projectId: project.id,
              title: 'FR04 Date ' + consumer,
              clientRequestId: crypto.randomUUID(),
              startDate: '2026-03-05',
              dueDate: '2026-03-10',
            },
          })
        ).data.task;
      }, consumer);
      const view = JSON.stringify({ query: { q: task.title } });
      await navigate(
        p,
        `/w/${a}/tasks?mode=${consumer === 'table' ? 'table' : 'list'}&view=${encodeURIComponent(view)}${consumer === 'drawer' ? '&taskId=' + task.id : ''}`,
      );
      const host =
        consumer === 'drawer'
          ? p.locator('[data-task-drawer]')
          : p.locator(
              `[${consumer === 'table' ? 'data-table-task' : 'data-task-row'}="${task.id}"]`,
            );
      await host.getByRole('button', { name: 'Due date', exact: true }).click();
      await p
        .getByRole('dialog', { name: 'Due date', exact: true })
        .getByRole('button', { name: '2026-03-01', exact: true })
        .click();
      await expect
        .poll(() =>
          p.evaluate(async (taskId) => {
            const h = window.__shellHarness,
              t = (await h.client.api.getTask({ workspaceId: h.workspaceA, taskId })).data.task;
            return [t.startDate, t.dueDate];
          }, task.id),
        )
        .toEqual(['2026-03-01', '2026-03-01']);
    });
  await probe('draft-date-policy-preserves-independent-inputs', async (p, a) => {
    await navigate(p, `/w/${a}/tasks`);
    await p.getByRole('button', { name: 'New task', exact: true }).first().click();
    const form = p.locator('[data-task-form]');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Start date', exact: true }).click();
    await p
      .getByRole('dialog', { name: 'Start date', exact: true })
      .getByRole('button', { name: 'Tomorrow', exact: true })
      .click();
    await form.getByRole('button', { name: 'Due date', exact: true }).click();
    await p
      .getByRole('dialog', { name: 'Due date', exact: true })
      .getByRole('button', { name: 'Today', exact: true })
      .click();
    await form.getByRole('button', { name: 'Start date', exact: true }).click();
    const tomorrow = await p.evaluate(() => {
      const day = new Date(window.__shellHarness.today + 'T00:00:00Z');
      day.setUTCDate(day.getUTCDate() + 1);
      return day.toISOString().slice(0, 10);
    });
    await expect(
      p
        .getByRole('dialog', { name: 'Start date', exact: true })
        .getByRole('button', { name: tomorrow, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
  await probe('app-services-project-share-focus-notice-and-undo', async (p, a) => {
    const project = await p.evaluate(async () => {
      const h = window.__shellHarness;
      return (await h.client.api.getBootstrap({ workspaceId: h.workspaceA })).data.projects.find(
        (row) => row.access === 'allowed',
      ).project;
    });
    await navigate(p, `/w/${a}/projects/${project.id}/overview`);
    await expect(p.locator('[data-project-host]')).toBeVisible();
    const share = p.getByRole('button', { name: 'Share', exact: true });
    await share.click();
    await expect(p.locator('[data-project-share]')).toBeVisible();
    await p.keyboard.press('Escape');
    await expect(p.locator('[data-project-share]')).toHaveCount(0);
    await expect(share).toBeFocused();
    await p.getByRole('button', { name: 'More', exact: true }).click();
    await p.getByRole('menuitem', { name: 'Archive project', exact: true }).click();
    await expect(p.locator('[data-project-confirm]')).toBeVisible();
    await p.getByRole('button', { name: 'Archive project', exact: true }).click();
    await expect(p.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(() =>
        p.evaluate(async (id) => {
          const h = window.__shellHarness;
          return (await h.client.api.getProject({ workspaceId: h.workspaceA, projectId: id })).data
            .archivedAt;
        }, project.id),
      )
      .toBe(null);
  });
  report.status =
    report.probes.every((row) => row.pass) && !report.pageErrors.length ? 'passed' : 'failed';
} finally {
  if (browser) await browser.close();
  await server.stop();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
