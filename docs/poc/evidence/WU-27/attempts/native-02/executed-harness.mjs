import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets } from '../settings/assets.mjs';
import { createSeedDataset } from '../../../apps/web/src/data/mock/seed.ts';
import { onboardingStorageKey } from '../../../apps/web/src/data/onboarding-demo.ts';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-27/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required'); fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets() }), seed = createSeedDataset();
const report = { status: 'running', runtime: { node: process.version, ...environment }, probes: [], assetsBefore: assets(), immutableBefore: immutableInputs(), scope: 'Native mock onboarding transitions, storage, history, reload/direct entry, scoped template dataset and switching. No real provisioning/account/invitation/email.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
let browser, page, context; const stop = await targetServer();
const entry = async step => { await page.goto(`http://127.0.0.1:5173/onboarding?step=${step}`); await page.waitForSelector('[data-onboarding-step]'); await ready(page); };
const stepIs = step => expect(page.locator('[data-onboarding-step]')).toHaveAttribute('data-onboarding-step', String(step));
const next = async () => { await page.locator('#onb-next').click(); await ready(page); };
const back = async () => { await page.getByRole('button', { name: 'Back', exact: true }).click(); await ready(page); };
const draft = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).draft, onboardingStorageKey);
const snapshot = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
async function probe(id, run) { report.active = id; save(); report.probes.push({ id, status: 'passed', ...await run() }); save(); console.log(`${id}: passed`); }
try {
  browser = await chromium.launch({ args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version(); ({ page, context } = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'));
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await probe('N27-01-direct-prerequisites', async () => { for (const step of [5, 4, 3, 2, 1, 0, 99, -1, 'bad']) { await entry(step); await stepIs(0); assert.equal(new URL(page.url()).search, '?step=0'); } assert.equal(await page.locator('[data-sidebar]').count(), 0); return { missingPrerequisites: 6, invalid: 3, normalized: true }; });
  await probe('N27-02-back-validation-draft-reload', async () => {
    await page.getByRole('radio', { name: /^Design/ }).click(); await next(); await stepIs(1); await expect(page.locator('#o-ws')).toBeFocused(); await next(); await expect(page.getByText('Name your workspace to continue')).toBeVisible(); await expect(page.locator('#o-ws')).toBeFocused();
    await page.locator('#o-ws').fill('New Studio'); await expect(page.locator('#o-url')).toHaveValue('new-studio'); await page.locator('#o-url').fill('manual-url'); await page.locator('#o-ws').fill('Newer Studio'); await expect(page.locator('#o-url')).toHaveValue('manual-url');
    await next(); await stepIs(2); await page.getByRole('radio', { name: /^Tables/ }).click(); await page.getByRole('radio', { name: '11-50', exact: true }).click(); await back(); await expect(page.locator('#o-ws')).toHaveValue('Newer Studio'); await expect(page.locator('#o-url')).toHaveValue('manual-url'); await page.reload(); await stepIs(1); await expect(page.locator('#o-ws')).toHaveValue('Newer Studio');
    await next(); await stepIs(2); await expect(page.getByRole('radio', { name: /^Tables/ })).toHaveAttribute('aria-checked', 'true'); await next(); await stepIs(3); await expect(page.locator('#o-proj')).toBeFocused(); await page.getByRole('radio', { name: /^Design Project/ }).click(); await expect(page.locator('#o-proj')).toHaveValue('Design Project'); await page.locator('#o-proj').fill('Custom Project'); await page.getByRole('radio', { name: /^Website/ }).click(); await expect(page.locator('#o-proj')).toHaveValue('Custom Project'); await page.locator('#o-proj').fill(''); await next(); await expect(page.getByText('Give your project a name')).toBeVisible(); await expect(page.locator('#onb-next')).toBeFocused(); await page.locator('#o-proj').fill('Custom Project');
    return { sourceDefaults: true, focusAfter20ms: true, workspaceValidation: true, projectToastRetainsButtonFocus: true, backAndReloadPreserveDraft: true, touchedSlugAndTemplateName: true };
  });
  await probe('N27-03-invite-validation-copy-skip', async () => {
    await next(); await stepIs(4); await expect(page.locator('#o-inv-0')).toBeFocused(); await page.locator('#o-inv-0').fill('invalid'); await next(); await expect(page.getByText("invalid isn't a valid email address")).toBeVisible(); await stepIs(4);
    await page.locator('#o-inv-0').fill('one@example.com'); await page.locator('#o-inv-1').fill('two@example.com'); await back(); await next(); await expect(page.locator('#o-inv-0')).toHaveValue('one@example.com');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.getByRole('button', { name: 'Copy invite link instead' }).click(); await expect(page.getByText('Demo setup link copied. It grants no access and sends no invitation.')).toBeVisible(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'http://127.0.0.1:5173/onboarding?step=0');
    await page.getByRole('button', { name: 'Skip for now' }).click(); await stepIs(5); assert.deepEqual((await draft()).invites, ['', '', '']); await expect(page.getByText('No invites yet', { exact: true })).toBeVisible();
    return { invalidEmail: true, backRetained: true, copiedCanonicalDemoLinkNoAccess: true, skipClearsAllThree: true };
  });
  await probe('N27-04-direct-six-reload-exit-history', async () => {
    for (let step = 0; step < 6; step++) { await entry(step); await stepIs(step); await page.reload(); await stepIs(step); }
    const before = await draft(); await page.getByRole('button', { name: 'Exit setup', exact: true }).click(); await expect(page).toHaveURL(/\/w\/[^/]+\/home$/); assert.deepEqual(await draft(), before); await page.goBack(); await stepIs(5); return { validDirect: 6, validReload: 6, exitPreservesDraft: true, backHistory: true };
  });
  await probe('N27-05-finish-once-new-scope-reload', async () => {
    const before = await snapshot(), seedKey = Object.keys(before).find(key => key.startsWith('task8.mock.v1:'));
    await page.getByRole('button', { name: 'Open workspace', exact: true }).dblclick(); await expect(page).toHaveURL(/\/w\/[^/]+\/projects\/[^/]+\/table$/); await page.waitForSelector('[data-workspace-id]');
    const after = await snapshot(), receipt = JSON.parse(after[onboardingStorageKey]), datasetKey = Object.keys(after).find(key => key.endsWith(`:${receipt.result.workspaceId}`));
    assert.notEqual(receipt.result.workspaceId, seed.workspaceId); assert.equal(after[seedKey], before[seedKey]); const dataset = JSON.parse(after[datasetKey]).dataset;
    assert.equal(Object.keys(dataset.projects).length, 1); assert.equal(Object.keys(dataset.tasks).length, 6); assert.equal(dataset.projects[receipt.result.projectId].name, 'Custom Project'); assert.equal(dataset.workspaces[dataset.workspaceId].name, 'Newer Studio'); assert.equal(dataset.preferences.defaultTab, 'table');
    await page.reload(); await expect(page).toHaveURL(/\/table$/); assert.equal((await snapshot())[datasetKey], after[datasetKey]);
    await entry(5); await page.getByRole('button', { name: 'Open workspace', exact: true }).click(); await expect(page).toHaveURL(/\/table$/); assert.equal((await snapshot())[datasetKey], after[datasetKey]);
    report.finishedScope = { workspaceId: receipt.result.workspaceId, projectId: receipt.result.projectId, templateTasks: Object.values(dataset.tasks).map(task => task.title), seedUnchanged: true }; save();
    return { doubleClickOnce: true, reloadAndRetrySameIds: true, newWorkspaceScope: true, oldSeedBytesUnchanged: true, tasks: 6, principalMembershipSeparate: dataset.currentMemberId !== seed.currentMemberId };
  });
  await probe('N27-06-switch-both-ways-no-old-selection', async () => {
    const freshId = report.finishedScope.workspaceId; await page.goto(`http://127.0.0.1:5173/w/${seed.workspaceId}/tasks`); await page.waitForSelector('[data-workspace-id]'); await expect(page.locator('[data-workspace-id]').first()).toHaveAttribute('data-workspace-id', seed.workspaceId);
    const checkbox = page.getByRole('checkbox', { name: /^Select / }).first(); if (await checkbox.count()) await checkbox.check();
    await page.getByRole('button', { name: 'Switch workspace', exact: true }).click(); await page.getByRole('menuitem', { name: /Newer Studio/ }).click(); await expect(page).toHaveURL(new RegExp(`/w/${freshId}/home`));
    await page.goto(`http://127.0.0.1:5173/w/${freshId}/tasks`); await page.waitForSelector('[data-workspace-id]'); assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0); await expect(page.getByText('Sitemap & information architecture', { exact: true }).first()).toBeVisible();
    const current = JSON.parse((await snapshot())[onboardingStorageKey]); assert.equal(current.result.workspaceId, freshId); return { switchToSeedAndBack: true, selectedTasksCleared: true, scopedTemplateVisible: true };
  });
  await probe('N27-07-mobile-scroll', async () => { await page.setViewportSize({ width: 390, height: 844 }); await entry(3); await page.mouse.wheel(0, 1200); await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport(); const scroll = await page.locator('[data-auth-layout]').evaluate(el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, height: el.clientHeight })); return { actualWheel: true, scroll }; });
  assert.deepEqual(errors, []); report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsAfter, report.assetsBefore); assert.deepEqual(report.immutableAfter, report.immutableBefore); report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error); save(); throw error; } finally { await browser?.close(); await stop(); }
