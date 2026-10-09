import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { artifacts, readJson, checkSource } from '../reference/source-check.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
const root = 'docs/poc/evidence/WU-19', attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('A unique attempt is required'); const output = `${root}/attempts/${attempt}`; if (fs.existsSync(output)) throw Error('Never overwrite evidence'); fs.mkdirSync(output, { recursive: true }); fs.copyFileSync('tests/visual/notifications/interactions.mjs', `${output}/executed-harness.mjs`);
const workspaceId = sourceId('workspaces', 'w1'), taskId = sourceId('tasks', 't3'), n1 = sourceId('notifs', 'n1'), base = `http://127.0.0.1:5173/w/${workspaceId}`;
const report = { status: 'running', probes: [], runtime: { node: process.version, ...environment }, sourceSha: '904205c626918ee96054eb35495c394a60c0c601', scope: 'Native production mock app plus Source native inclusive boundary journeys. Persisted canonical task/comment/notification identities; no backend/transport claim.' }, save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
let browser, page; const stopSource = await sourceServer(), stopTarget = await targetServer();
async function probe(id, work) { const value = await work(); report.probes.push({ id, status: 'passed', ...value }); save(); console.log(id); }
async function dataset() { return page.evaluate(() => { const key = Object.keys(localStorage).find(key => key.startsWith('task8.mock.v1:')); return JSON.parse(localStorage.getItem(key)).dataset; }); }
const row = id => page.locator(`[data-notification-id="${id}"]`);
async function badges(inbox, notifications) {
  if (inbox) await expect(page.locator(`.shell-sidebar a[href$="/inbox"] .shell-count`)).toHaveText(String(inbox));
  else assert.equal(await page.locator(`.shell-sidebar a[href$="/inbox"] .shell-count`).count(), 0);
  if (notifications) await expect(page.locator(`.shell-sidebar a[href$="/notifications"] .shell-count`)).toHaveText(String(notifications));
  else assert.equal(await page.locator(`.shell-sidebar a[href$="/notifications"] .shell-count`).count(), 0);
}
try {
  checkSource(); browser = await chromium.launch({ headless: true }); report.runtime.browser = browser.version(); const context = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'); page = context.page;
  await page.goto(`${base}/inbox`); await page.waitForSelector('[data-notifications-ready]'); await ready(page);
  await probe('N19-01-toggle-select-persisted-read-unread-and-shared-badges', async () => {
    await badges(4, 6); await row(n1).getByRole('button', { name: 'Mark as read', exact: true }).click(); await badges(3, 5); assert.equal(await page.locator('[data-inbox-preview][data-selected]').count(), 0);
    await row(n1).getByRole('button', { name: 'Mark as unread', exact: true }).click(); await badges(4, 6); await row(n1).click(); await page.waitForSelector('[data-conversation-ready]'); await badges(3, 5); assert.equal(Date.parse((await dataset()).notifications[n1].readAt), Date.parse(environment.clock));
    await page.getByRole('button', { name: 'Back', exact: true }).click(); await row(n1).getByRole('button', { name: 'Mark as unread', exact: true }).click(); await badges(4, 6); await page.reload(); await page.waitForSelector('[data-notifications-ready]'); await badges(4, 6);
    await page.locator('.shell-sidebar a[href$="/notifications"]').click(); await page.waitForSelector('[data-notifications-ready]'); await expect(row(n1).locator('[aria-label=Unread]')).toHaveCount(1); await row(n1).getByRole('button', { name: 'Mark as read', exact: true }).click(); await badges(3, 5); await page.reload(); await page.waitForSelector('[data-notifications-ready]'); assert.equal(Date.parse((await dataset()).notifications[n1].readAt), Date.parse(environment.clock));
    return { singlePersistedTable: true, toggleDidNotSelect: true, counts: { original: [4, 6], read: [3, 5] }, reloadPreserved: true };
  });
  await probe('N19-02-categories-unread-mark-all-empty-reload', async () => {
    await page.locator('.shell-sidebar a[href$="/inbox"]').click(); await page.waitForSelector('[data-notifications-ready]'); await page.getByRole('tab', { name: /^Mentions/ }).click(); assert.equal(await page.locator('[data-notification-id]').count(), 2); await page.getByRole('switch', { name: 'Unread', exact: true }).check(); assert.equal(await page.locator('[data-notification-id]').count(), 1);
    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click(); await page.getByRole('heading', { name: "You're all caught up.", exact: true }).waitFor(); await expect(page.locator('.ui-toast')).toContainText("You're all caught up.");
    await expect.poll(async () => Object.values((await dataset()).notifications).filter(row => !row.readAt).length).toBe(0);
    await page.locator('.shell-sidebar a[href$="/notifications"]').click(); await page.waitForSelector('[data-notifications-ready]'); assert.equal(await page.getByRole('button', { name: 'Mark all as read', exact: true }).isDisabled(), true); await page.getByRole('radio', { name: 'Unread', exact: true }).click(); await page.getByRole('heading', { name: "You're all caught up.", exact: true }).waitFor(); await page.getByRole('button', { name: 'Show all', exact: true }).click(); assert.equal(await page.locator('[data-notification-id]').count(), 10); await page.reload(); await page.waitForSelector('[data-notifications-ready]'); assert.equal(await page.getByRole('button', { name: 'Mark all as read', exact: true }).isDisabled(), true);
    return { categoriesNative: true, readAllPersisted10: true, emptyAndShowAll: true };
  });
  await probe('N19-03-Inbox-reply-mention-reaction-same-Drawer-comments-and-source-attachment-location', async () => {
    await page.goto(`${base}/inbox`); await page.waitForSelector('[data-notifications-ready]'); await row(n1).click(); await page.waitForSelector('[data-conversation-ready]'); const preview = page.locator('[data-inbox-preview]');
    assert.equal(await preview.locator('input[type=file]').count(), 0); assert.equal(await preview.getByRole('button', { name: 'Mention', exact: true }).count(), 0);
    const mentionedMember = (await dataset()).members[sourceId('members', 'm2')]; const reply = `WU19 native reply @${mentionedMember.name}`; await preview.getByRole('textbox', { name: 'Reply', exact: true }).fill(reply); await preview.getByRole('textbox', { name: 'Reply', exact: true }).press('Meta+Enter'); await expect(preview.getByRole('textbox', { name: 'Reply', exact: true })).toHaveValue(''); await expect(page.locator('.ui-toast')).toContainText('Reply posted'); await preview.locator('[data-comment-id]').filter({ hasText: reply }).waitFor();
    const canonical = Object.values((await dataset()).comments).find(row => row.bodyText === reply); assert.equal(canonical.taskId, taskId); assert.ok(canonical.mentionedMemberIds.includes(sourceId('members', 'm2')));
    const comment = preview.locator(`[data-comment-id="${sourceId('comments', 'c1')}"]`); await comment.getByRole('button', { name: '👍 2', exact: true }).click(); await comment.getByRole('button', { name: '👍 3', exact: true }).waitFor();
    await preview.getByRole('button', { name: 'Open task', exact: true }).click(); const drawer = page.locator(`[data-task-drawer="${taskId}"]`); await drawer.waitFor(); await drawer.locator('[data-comment-id]').filter({ hasText: reply }).waitFor(); await drawer.locator(`[data-comment-id="${sourceId('comments', 'c1')}"]`).getByRole('button', { name: '👍 3', exact: true }).waitFor();
    const before = Object.values((await dataset()).files).filter(row => row.taskId === taskId).length; await drawer.locator('input[aria-label="Attach comment files"]').setInputFiles({ name: 'WU19-drawer-attachment.txt', mimeType: 'text/plain', buffer: Buffer.from('WU19 canonical attachment') }); await drawer.getByRole('button', { name: 'Preview WU19-drawer-attachment.txt', exact: true }).waitFor(); assert.equal(Object.values((await dataset()).files).filter(row => row.taskId === taskId).length, before + 1);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click(); await expect(preview.getByRole('textbox', { name: 'Reply', exact: true })).toHaveValue('');
    return { commentId: canonical.id, taskId, mentionedMemberId: sourceId('members', 'm2'), sameCommentAndReactionInDrawer: true, sourceInboxHasNoAttachmentAffordance: true, DrawerCanonicalAttachmentCreated: true };
  });
  await probe('N19-04-command-registry-palette-GI-GN-real-navigation', async () => {
    await page.goto(`${base}/home`); await page.waitForSelector('[data-dashboard-ready]'); await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('g'); await page.keyboard.press('i'); await page.waitForURL(url => url.pathname.endsWith('/inbox')); await page.waitForSelector('[data-notifications-ready]');
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('g'); await page.keyboard.press('n'); await page.waitForURL(url => url.pathname.endsWith('/notifications')); await page.waitForSelector('[data-notifications-ready]');
    await page.getByRole('button', { name: 'Search and commands', exact: true }).click(); await page.locator('#pal-in').fill('Go to Inbox'); await page.getByRole('option', { name: /^Go to Inbox/ }).click(); await page.waitForURL(url => url.pathname.endsWith('/inbox')); await page.waitForSelector('[data-notifications-ready]'); assert.equal(await page.locator('#pal-in').count(), 0);
    return { GI: '/inbox', GN: '/notifications', paletteInboxImplemented: true };
  });
  await probe('N19-05-Notifications-task-and-project-notice-use-canonical-navigation', async () => {
    await page.goto(`${base}/notifications`); await page.waitForSelector('[data-notifications-ready]'); await row(n1).click(); await page.locator(`[data-task-drawer="${taskId}"]`).waitFor(); await page.locator('[data-task-drawer]').getByRole('button', { name: 'Close', exact: true }).click();
    await row(sourceId('notifs', 'n6')).click(); await page.waitForURL(url => url.pathname.includes(sourceId('projects', 'p4'))); await page.waitForSelector('[data-project-host]');
    return { canonicalTaskId: taskId, canonicalProjectId: sourceId('projects', 'p4') };
  });
  await context.context.close();
  for (const width of [390, 899, 900, 901]) await probe(`N19-06-boundary-${width}-Source-Target-Back-scroll-selection-focus-z`, async () => {
    const details = [];
    for (const side of ['source', 'target']) {
      const session = await newPage(browser, { viewport: { width, height: width === 390 ? 844 : 1000 }, mobile: width === 390 }, side === 'source' ? readJson(`${artifacts}/source-fixture.json`) : undefined, true, side === 'target' ? 'http://127.0.0.1:5173' : undefined), p = session.page; page = p;
      await p.goto(side === 'source' ? 'http://127.0.0.1:4173' : `${base}/inbox`);
      if (side === 'source') { if (width <= 900) await p.getByRole('button', { name: 'Open navigation', exact: true }).click(); await p.locator('.side [data-r=inbox]').click(); } else await p.waitForSelector('[data-notifications-ready]');
      await ready(p); const list = p.locator('.inbox-list'), preview = p.locator(side === 'source' ? '.inbox-prev' : '[data-inbox-preview]');
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; }); const scrollBefore = await list.evaluate(el => el.scrollTop), lastSource = [...readJson(`${artifacts}/source-fixture.json`).data.notifs].sort((a, b) => b.at - a.at).at(-1), selectedKey = side === 'source' ? lastSource.id : sourceId('notifs', lastSource.id), selectedRow = p.locator(side === 'source' ? `[data-a=selNotif][data-id="${selectedKey}"]` : `[data-notification-id="${selectedKey}"]`);
      await selectedRow.click({ position: { x: 80, y: 12 } }); if (side === 'target') await p.waitForSelector('[data-conversation-ready]'); await ready(p);
      const geometry = await preview.evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), css: { position: getComputedStyle(el).position, zIndex: getComputedStyle(el).zIndex } })); assert.equal(geometry.css.position, width <= 900 ? 'fixed' : 'static'); if (width <= 900) { assert.equal(geometry.rect.x, 0); assert.equal(geometry.rect.y, 0); assert.equal(geometry.rect.width, width); assert.equal(geometry.css.zIndex, '48'); }
      await preview.getByRole('button', { name: 'Open task', exact: true }).click(); const drawer = p.locator(side === 'source' ? '.drawer' : '[data-task-drawer]'); await drawer.waitFor(); assert.equal(await drawer.evaluate(el => getComputedStyle(el).zIndex), '50'); await drawer.getByRole('button', { name: 'Close', exact: true }).click(); await preview.getByRole('button', { name: 'Back', exact: true }).click(); await ready(p); assert.equal(await list.evaluate(el => el.scrollTop), scrollBefore);
      if (side === 'target') assert.equal(await selectedRow.evaluate(el => document.activeElement === el), true);
      const selectedAfter = side === 'source' ? await p.evaluate(async () => (await import('/src/core/store.js')).S.ui.inboxSel) : await preview.getAttribute('data-selected'); assert.equal(selectedAfter, null);
      await p.screenshot({ path: `${output}/boundary-${width}-${side}-after-back.png` }); details.push({ side, selectedCanonicalId: sourceId('notifs', lastSource.id), scrollBefore, scrollAfter: await list.evaluate(el => el.scrollTop), geometry, selectionAfter: selectedAfter, focus: await p.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent })) }); await session.context.close();
    }
    return { width, details };
  });
  report.status = 'passed'; save(); checkSource();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failed.png` }); save(); throw error; } finally { await browser?.close(); await stopTarget(); await stopSource(); }
