import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { withBrowserSession } from '../../frontend/browser-session.mjs';
import { claimOutput } from '../../frontend/output.mjs';
import { createBrowserReport } from '../../frontend/browser-report.mjs';
import { decodeOperation } from '../../frontend/http-intercept.mjs';
import { operations } from '../../../packages/contracts/src/operations.ts';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
import { immutableInputs, implementationAssets } from './assets.mjs';
import { createMockClient } from '../../../apps/web/src/data/adapters/mock.ts';
const output = claimOutput(
  process.argv.find((arg) => arg.startsWith('--output='))?.slice(9),
  'teams-http',
);
const workspaceId = sourceId('workspaces', 'w1'),
  client = createMockClient();
const {
  report,
  save,
  probe: recordProbe,
  finish,
} = createBrowserReport(output, {
  requests: [],
  runtime: { node: process.version },
  immutableBefore: immutableInputs(),
  implementationAssetsBefore: implementationAssets(),
  scope:
    'Actual HTTP-built adapter, typed intercepted responses backed by canonical mock operations. Canonical team read/loading/create/update/delete/Undo errors, stale-version retry and deleted selections; no real backend/D1/R2/email/account delivery or live fallback.',
});
let base;
let browser,
  page,
  createdId,
  nextFault = null;
const held = new Map(),
  failures = new Set();
async function probe(id, work) {
  return recordProbe(id, work, {
    skip:
      process.argv.includes('--remaining') &&
      ['H21-01', 'H21-02', 'H21-03', 'H21-04', 'H21-05'].some((prefix) => id.startsWith(prefix))
        ? 'remaining-selection'
        : undefined,
  });
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
  await client.api.updatePreferences({ workspaceId, body: { lang: 'en' } });
  await withBrowserSession(
    { servers: [{ directory: 'apps/web/dist-http' }] },
    async (resources) => {
      browser = resources.browser;
      report.runtime.browser = browser.version();
      const origin = resources.servers[0].origin;
      base = `${origin}/w/${workspaceId}`;
      const session = await resources.newPage();
      page = session.page;
      page.setDefaultTimeout(10000);
      await session.context.route('**/api/v1/**', async (route) => {
        const { id, input } = decodeOperation(route.request());
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
            json: { error: { code: 'INTERNAL_ERROR', message: `WU21 injected ${id} failure` } },
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
          entry.intentional =
            (error.status === 409 && id === 'updateTeam' && input.teamId === createdId) ||
            (error.status === 404 &&
              ['getTeam', 'getTeamSummary'].includes(id) &&
              input.teamId === createdId);
          await route.fulfill({
            status: error.status ?? 500,
            json: { error: error.detail ?? { code: 'INTERNAL_ERROR', message: String(error) } },
          });
        }
      });

      await probe('H21-01-loading-listTeams-no-fake-empty', async () => {
        await hold('listTeams', false);
        await page.goto(`${base}/teams`);
        await expect.poll(() => held.has('listTeams')).toBe(true);
        await page.getByRole('status').filter({ hasText: 'Loading teams…' }).waitFor();
        assert.equal(await page.locator('[data-team-card]').count(), 0);
        assert.equal(
          await page.getByRole('heading', { name: 'No teams yet', exact: true }).count(),
          0,
        );
        await release('listTeams');
        await page.waitForSelector('[data-teams-ready]');
        assert.equal(await page.locator('[data-team-card]').count(), 4);
        return { held: true, noEmptyFallback: true };
      });
      await probe('H21-02-TeamSummary-failure-visible-real-Retry', async () => {
        failures.add('getTeamSummary');
        await page.goto(`${base}/teams/${sourceId('teams', 'eng')}`);
        await page
          .getByRole('alert')
          .filter({ hasText: 'WU21 injected getTeamSummary failure' })
          .waitFor();
        assert.equal(await page.locator('[data-team-detail]').count(), 0);
        failures.delete('getTeamSummary');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await page.waitForSelector('[data-team-detail][data-teams-ready]');
        return { errorVisible: true, realRetry: true };
      });
      await probe(
        'H21-03-create500-preserves-draft-selection-zero-fake-success-retry',
        async () => {
          await page.goto(`${base}/teams`);
          await page.waitForSelector('[data-teams-ready]');
          const before = (await client.api.getBootstrap({ workspaceId })).data;
          await page
            .locator('[data-teams-page]')
            .getByRole('button', { name: 'New team', exact: true })
            .first()
            .click();
          await page.locator('#tm-name').fill('HTTP Growth');
          await page.locator('#tm-desc').fill('Keep this draft');
          await page.getByRole('checkbox', { name: 'Sarah Chen', exact: true }).check();
          failures.add('createTeam');
          await page.getByRole('button', { name: 'Create team', exact: true }).click();
          await expect(page.locator('[data-team-form]')).toContainText(
            'WU21 injected createTeam failure',
          );
          await expect(page.locator('#tm-name')).toHaveValue('HTTP Growth');
          await expect(page.locator('#tm-desc')).toHaveValue('Keep this draft');
          await expect(
            page.getByRole('checkbox', { name: 'Sarah Chen', exact: true }),
          ).toBeChecked();
          assert.equal(await page.locator('.ui-toast').count(), 0);
          assert.deepEqual((await client.api.getBootstrap({ workspaceId })).data, before);
          failures.delete('createTeam');
          await page.getByRole('button', { name: 'Create team', exact: true }).click();
          await page.waitForSelector('[data-team-detail][data-teams-ready]');
          createdId = await page.locator('[data-team-detail]').getAttribute('data-team-detail');
          assert.equal(
            (await client.api.getMember({ workspaceId, memberId: sourceId('members', 'm2') })).data
              .teamId,
            createdId,
          );
          return {
            createdId,
            draftRetained: true,
            selectionRetained: true,
            zeroWritesOn500: true,
            actualHTTPRetry: true,
          };
        },
      );
      await probe('H21-04-stale-update409-keeps-draft-refetches-version-retry', async () => {
        await page.getByRole('button', { name: 'Edit team', exact: true }).click();
        await page.locator('#tm-name').fill('HTTP Revenue');
        const before = (await client.api.getTeam({ workspaceId, teamId: createdId })).data;
        await client.api.updateTeam({
          workspaceId,
          teamId: createdId,
          body: { expectedVersion: before.version, description: 'Concurrent server edit' },
        });
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.locator('[data-team-form]')).toContainText('This team changed');
        await expect(page.locator('#tm-name')).toHaveValue('HTTP Revenue');
        assert.equal(
          (await client.api.getTeam({ workspaceId, teamId: createdId })).data.name,
          'HTTP Growth',
        );
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.locator('[data-team-detail] h1')).toHaveText('HTTP Revenue');
        return {
          actualCAS409: true,
          draftRetained: true,
          canonicalVersionRefetched: true,
          retrySucceeded: true,
        };
      });
      await probe(
        'H21-05-delete500-confirmation-retained-Undo500-retry-no-fake-success',
        async () => {
          await page.getByRole('button', { name: 'Edit team', exact: true }).click();
          await page
            .locator('[data-team-form]')
            .getByRole('button', { name: 'Delete team', exact: true })
            .click();
          const before = (await client.api.getBootstrap({ workspaceId })).data;
          failures.add('deleteTeam');
          await page
            .locator('[data-team-delete]')
            .getByRole('button', { name: 'Delete team', exact: true })
            .click();
          await expect(page.locator('[data-team-delete]')).toContainText(
            'WU21 injected deleteTeam failure',
          );
          assert.deepEqual((await client.api.getBootstrap({ workspaceId })).data, before);
          failures.delete('deleteTeam');
          await page
            .locator('[data-team-delete]')
            .getByRole('button', { name: 'Delete team', exact: true })
            .click();
          await page.waitForURL((url) => url.pathname.endsWith('/teams'));
          await page.waitForSelector('[data-teams-ready]');
          assert.equal(await page.locator(`[data-team-card="${createdId}"]`).count(), 0);
          failures.add('undoCommand');
          await page
            .locator('.ui-toast')
            .filter({ hasText: 'Deleted HTTP Revenue' })
            .getByRole('button', { name: 'Undo', exact: true })
            .click();
          await page
            .getByRole('alert')
            .filter({ hasText: 'WU21 injected undoCommand failure' })
            .waitFor();
          assert.ok(
            !(await client.api.listTeams({ workspaceId, query: {} })).data.some(
              (team) => team.id === createdId,
            ),
          );
          failures.delete('undoCommand');
          await page.getByRole('button', { name: 'Retry Undo', exact: true }).click();
          await expect(page.locator(`[data-team-card="${createdId}"]`)).toHaveCount(1);
          assert.equal(
            (await client.api.getMember({ workspaceId, memberId: sourceId('members', 'm2') })).data
              .teamId,
            createdId,
          );
          return {
            deleteFailedNoWrite: true,
            confirmationRetained: true,
            UndoFailedNoRestore: true,
            UndoRetryCanonical: true,
          };
        },
      );
      await probe(
        'H21-06-external-delete-clears-open-project-selection-and-Invite-choice',
        async () => {
          if (process.argv.includes('--remaining')) {
            await page.goto(`${base}/teams`);
            await page.waitForSelector('[data-teams-ready]');
            await page
              .locator('[data-teams-page]')
              .getByRole('button', { name: 'New team', exact: true })
              .first()
              .click();
            await page.locator('#tm-name').fill('HTTP Revenue');
            await page.getByRole('button', { name: 'Create team', exact: true }).click();
            await page.waitForSelector('[data-team-detail][data-teams-ready]');
            createdId = await page.locator('[data-team-detail]').getAttribute('data-team-detail');
          }
          await page.goto(`${base}/projects/${sourceId('projects', 'p1')}/overview`);
          await page.waitForSelector('[data-project-host]');
          await page.getByRole('button', { name: 'Search and commands', exact: true }).click();
          await page.locator('#pal-in').fill('Create project');
          await page.getByRole('option', { name: /^Create project/ }).waitFor();
          await page.locator('#pal-in').press('Enter');
          await page.locator('[data-project-form]').waitFor();
          const combo = page
            .locator('[data-project-form]')
            .getByRole('button', { name: 'Team', exact: true });
          await combo.click();
          await page.getByRole('option', { name: 'HTTP Revenue', exact: true }).click();
          const team = (await client.api.getTeam({ workspaceId, teamId: createdId })).data;
          await client.api.deleteTeam({
            workspaceId,
            teamId: createdId,
            body: { expectedVersion: team.version },
          });
          await page.evaluate(() => {
            Date.now = () => new Date('2026-10-08T09:01:00.000Z').getTime();
            window.dispatchEvent(new Event('visibilitychange'));
          });
          await expect(combo).toContainText('No team');
          await page
            .locator('[data-project-form]')
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
          await page.goto(`${base}/members`);
          await page.waitForSelector('[data-people-ready]');
          await page.getByRole('button', { name: 'Invite member', exact: true }).click();
          const invite = page.locator('[data-invite-dialog]');
          await invite.getByRole('button', { name: 'Team', exact: true }).click();
          assert.equal(
            await page.getByRole('option', { name: 'HTTP Revenue', exact: true }).count(),
            0,
          );
          await page.keyboard.press('Escape');
          await invite.getByRole('button', { name: 'Cancel', exact: true }).click();
          return {
            deletedSelectionCleared: true,
            noDeletedTeamOption: true,
            actualFocusRefetch: true,
          };
        },
      );
      await probe('H21-07-team-read404-remains-NotFound-Home-native', async () => {
        await page.goto(`${base}/teams/${createdId}`);
        await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor();
        assert.equal(await page.locator('[data-team-detail]').count(), 0);
        await page.getByRole('button', { name: 'Go to Home', exact: true }).click();
        await page.waitForSelector('[data-dashboard-ready]');
        return { deletedRouteNotFound: true, homeLink: true };
      });
      report.audit = {
        total: report.requests.length,
        intentionalErrors: report.requests.filter(
          (row) => row.outcome === 'error' && row.intentional,
        ).length,
        incidentalErrors: report.requests.filter(
          (row) => row.outcome === 'error' && !row.intentional,
        ),
        pending: report.requests.filter((row) => row.outcome === 'pending'),
        writes: report.requests.filter((row) => operations[row.operation].method !== 'GET'),
      };
      assert.equal(report.audit.incidentalErrors.length, 0);
      assert.equal(report.audit.pending.length, 0);
      assert.ok(report.audit.writes.some((row) => row.operation === 'createTeam'));
      if (!process.argv.includes('--remaining'))
        assert.ok(report.audit.writes.some((row) => row.operation === 'updateTeam'));
      if (!process.argv.includes('--remaining'))
        assert.ok(report.audit.writes.some((row) => row.operation === 'deleteTeam'));
      if (!process.argv.includes('--remaining'))
        assert.ok(report.audit.writes.some((row) => row.operation === 'undoCommand'));
      assert.ok(
        report.audit.writes.every((row) =>
          ['createTeam', 'updateTeam', 'deleteTeam', 'undoCommand'].includes(row.operation),
        ),
      );
      report.immutableAfter = immutableInputs();
      report.implementationAssetsAfter = implementationAssets();
      assert.deepEqual(report.immutableBefore, report.immutableAfter);
      assert.deepEqual(report.implementationAssetsBefore, report.implementationAssetsAfter);
      save();
      await page.screenshot({ path: `${output}/final.png` });
      finish();
    },
  );
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack);
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failed.png` });
  save();
  throw error;
} finally {
  for (const resolve of held.values()) resolve();
}
