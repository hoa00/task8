import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { newPage } from '../reference/environment.mjs';
import { operations } from '../../../packages/contracts/src/operations.ts';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { createMockClient } from '../../../apps/web/src/data/adapters/mock.ts';
const root = 'docs/poc/evidence/WU-20',
  attempt = process.argv.find((arg) => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('Unique attempt required');
const output = `${root}/attempts/${attempt}`;
if (fs.existsSync(output)) throw Error('Never overwrite');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync('tests/visual/people/http.mjs', `${output}/executed-harness.mjs`);
const workspaceId = sourceId('workspaces', 'w1'),
  base = `http://127.0.0.1:5173/w/${workspaceId}`,
  client = createMockClient();
const report = {
    status: 'running',
    probes: [],
    requests: [],
    runtime: { node: process.version },
    scope:
      'Actual HTTP-built adapter, typed intercepted responses backed by canonical mock operations. Directory/profile/session failures, local explicit demo storage fault/draft/retry; no real backend/D1/R2/email/account delivery or live fallback.',
  },
  save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const server = spawn(
  process.execPath,
  [
    './node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
    '--outDir',
    'dist-http',
  ],
  { cwd: path.resolve('apps/web'), stdio: 'pipe' },
);
let logs = '';
server.stdout.on('data', (bytes) => (logs += bytes));
server.stderr.on('data', (bytes) => (logs += bytes));
const stop = async () => {
  if (server.exitCode === null) {
    const done = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await done;
  }
};
let browser,
  page,
  nextFault = null;
const held = new Map(),
  failures = new Set();
async function probe(id, work) {
  const value = await work();
  report.probes.push({ id, status: 'passed', ...value });
  save();
  console.log(id);
}
async function hold(operation, failure = true) {
  nextFault = { operation, failure };
}
async function release(operation) {
  const resolve = held.get(operation);
  assert.ok(resolve);
  held.delete(operation);
  resolve();
}
try {
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch('http://127.0.0.1:5173')).ok) break;
    } catch {
      /* startup */
    }
    if (server.exitCode !== null) throw Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  report.runtime.browser = browser.version();
  const session = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173');
  page = session.page;
  await session.context.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    let found;
    for (const [id, operation] of Object.entries(operations)) {
      if (operation.method !== request.method()) continue;
      const keys = [...operation.path.matchAll(/\{(\w+)\}/g)].map((row) => row[1]),
        match = url.pathname.match(
          new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`),
        );
      if (match) {
        found = {
          id,
          input: Object.fromEntries(
            keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]),
          ),
        };
        break;
      }
    }
    if (!found) throw Error(`Unknown contract operation ${url.pathname}`);
    const { id, input } = found;
    if (url.search)
      input.query = Object.fromEntries(
        [...url.searchParams].map(([key, value]) => [
          key,
          key === 'limit'
            ? Number(value)
            : ['archived', 'unreadOnly', 'favoriteOnly'].includes(key)
              ? value === 'true'
              : key === 'filters'
                ? JSON.parse(value)
                : value,
        ]),
      );
    if (request.postData()) input.body = request.postDataJSON();
    const entry = { operation: id, input, outcome: 'pending' };
    report.requests.push(entry);
    const fault = nextFault?.operation === id ? nextFault : null;
    if (fault) {
      nextFault = null;
      await new Promise((resolve) => held.set(id, resolve));
    }
    if (fault?.failure || failures.has(id)) {
      entry.outcome = 'error';
      entry.intentional = true;
      await route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL_ERROR', message: `WU20 injected ${id} failure` } },
      });
      return;
    }
    try {
      const response = await client.execute(id, input);
      if (id === 'getSession') response.data.capabilities.dataMode = 'http';
      entry.outcome = 'fulfilled';
      await route.fulfill({ status: operations[id].successStatuses[0], json: response });
    } catch (error) {
      entry.outcome = 'error';
      entry.error = String(error);
      await route.fulfill({
        status: error.status ?? 500,
        json: { error: error.detail ?? { code: 'INTERNAL_ERROR', message: String(error) } },
      });
    }
  });

  await probe('H20-01-loading-directory-read-before-response', async () => {
    await hold('listMembers', false);
    await page.goto(`${base}/members`);
    await expect.poll(() => held.has('listMembers')).toBe(true);
    await page.getByRole('status').filter({ hasText: 'Loading members…' }).waitFor();
    assert.equal(await page.locator('[data-member-id]').count(), 0);
    await release('listMembers');
    await page.waitForSelector('[data-people-ready]');
    assert.equal(await page.locator('[data-member-id]').count(), 8);
    return { held: true, noEmptyFallback: true };
  });
  await probe('H20-02-canonical-profile-fault-and-real-Retry', async () => {
    failures.add('getMemberSummary');
    await page.goto(`${base}/members/${sourceId('members', 'm2')}`);
    await page
      .getByRole('alert')
      .filter({ hasText: 'WU20 injected getMemberSummary failure' })
      .waitFor();
    assert.equal(await page.locator('[data-member-profile]').count(), 0);
    failures.delete('getMemberSummary');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForSelector('[data-member-profile][data-people-ready]');
    return { errorVisible: true, realRetryRecovered: true };
  });
  await probe(
    'H20-03-demo-invite-local-storage-fault-preserves-draft-zero-networkwrite-then-retry',
    async () => {
      await page.goto(`${base}/members`);
      await page.waitForSelector('[data-people-ready]');
      await page.getByRole('button', { name: 'Invite member', exact: true }).click();
      const dialog = page.locator('[data-invite-dialog]'),
        before = (await client.api.listMembers({ workspaceId, query: {} })).data;
      await page.locator('#inv-emails').fill('recoverable@example.com');
      await page.evaluate(() => {
        window.wu20SetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('task8.demo.people.v1:'))
            throw Error('WU20 local demo storage denied');
          return window.wu20SetItem.call(this, key, value);
        };
      });
      await dialog.getByRole('button', { name: 'Send invites', exact: true }).click();
      await expect(dialog).toContainText('WU20 local demo storage denied');
      await expect(page.locator('#inv-emails')).toHaveValue('recoverable@example.com');
      assert.equal(await page.locator('.ui-toast').count(), 0);
      assert.deepEqual((await client.api.listMembers({ workspaceId, query: {} })).data, before);
      await page.evaluate(() => {
        Storage.prototype.setItem = window.wu20SetItem;
        delete window.wu20SetItem;
      });
      await dialog.getByRole('button', { name: 'Send invites', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('.ui-toast')).toContainText('No email was sent');
      await page.reload();
      await page.waitForSelector('[data-people-ready]');
      assert.equal(
        await page
          .locator('[data-member-id]')
          .filter({ hasText: 'recoverable@example.com' })
          .count(),
        1,
      );
      assert.deepEqual((await client.api.listMembers({ workspaceId, query: {} })).data, before);
      return {
        draftRetained: true,
        noFakeSuccess: true,
        localRetryPersisted: true,
        canonicalMembersUnchanged: true,
      };
    },
  );
  await probe('H20-04-directory-list-failure-and-retry', async () => {
    failures.add('listMembers');
    await page.reload();
    await page
      .getByRole('alert')
      .filter({ hasText: 'WU20 injected listMembers failure' })
      .first()
      .waitFor();
    assert.equal(await page.locator('[data-member-id]').count(), 0);
    failures.delete('listMembers');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForSelector('[data-people-ready]');
    return { noSuccessfulEmptyFallback: true, realRetry: true };
  });
  await probe('H20-05-session-background-error-retry-at-directory', async () => {
    failures.add('getSession');
    await page.evaluate(() => {
      Date.now = () => new Date('2026-10-08T09:00:31.000Z').getTime();
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await page
      .getByRole('alert')
      .filter({ hasText: 'WU20 injected getSession failure' })
      .first()
      .waitFor();
    failures.delete('getSession');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForSelector('[data-people-ready]');
    await expect(page.locator('[data-members-page] [role=alert]')).toHaveCount(0);
    return { actualSessionRefetchFailure: true, sessionQueryIncludedInRetry: true };
  });
  await probe('H20-06-profile-session-error-retry', async () => {
    await page.goto(`${base}/members/${sourceId('members', 'm2')}`);
    await page.waitForSelector('[data-member-profile][data-people-ready]');
    failures.add('getSession');
    await page.evaluate(() => {
      Date.now = () => new Date('2026-10-08T09:01:02.000Z').getTime();
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await page
      .getByRole('alert')
      .filter({ hasText: 'WU20 injected getSession failure' })
      .first()
      .waitFor();
    failures.delete('getSession');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForSelector('[data-member-profile][data-people-ready]');
    return { profileSessionRetryRecovered: true };
  });
  report.audit = {
    total: report.requests.length,
    intentionalErrors: report.requests.filter((row) => row.outcome === 'error' && row.intentional)
      .length,
    incidentalErrors: report.requests.filter((row) => row.outcome === 'error' && !row.intentional),
    pending: report.requests.filter((row) => row.outcome === 'pending'),
    writes: report.requests.filter((row) => operations[row.operation].method !== 'GET'),
  };
  assert.equal(report.audit.incidentalErrors.length, 0);
  assert.equal(report.audit.pending.length, 0);
  assert.equal(report.audit.writes.length, 0);
  report.status = 'passed';
  save();
  await page.screenshot({ path: `${output}/final.png` });
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack);
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failed.png` });
  save();
  throw error;
} finally {
  for (const resolve of held.values()) resolve();
  await browser?.close();
  await stop();
}
