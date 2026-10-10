import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const categories = [['all', 'All'], ['mention', 'Mentions'], ['assign', 'Assignments'], ['comment', 'Comments'], ['update', 'Updates']];
export async function checkCategoryBadges({ page, client, workspaceId }) {
 const observations = [];
 for (const unreadOnly of [false, true]) {
  await page.getByRole('switch', { name: 'Unread', exact: true }).setChecked(unreadOnly);
  for (const [selected, label] of categories) {
   await page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();
   const records = (await client.api.listNotifications({ workspaceId, query: { limit: 200 } })).data.items;
   const badges = [];
   for (const [type, name] of categories) {
    const expected = records.filter(row => !row.readAt && (type === 'all' || row.type === type)).length;
    const text = await page.getByRole('tab', { name: new RegExp(`^${name}`) }).innerText();
    assert.equal(Number(text.match(/\d+/)?.[0] ?? 0), expected, `${selected}/${unreadOnly}/${type}`); badges.push({ type, text, expected });
   }
   const visible = records.filter(row => (selected === 'all' || row.type === selected) && (!unreadOnly || !row.readAt)).map(row => row.id);
   await expect(page.locator('[data-notification-id]')).toHaveCount(visible.length);
   observations.push({ selected, unreadOnly, badges, visible });
  }
 }
 await page.getByRole('switch', { name: 'Unread', exact: true }).uncheck(); await page.getByRole('tab', { name: /^All/ }).click();
 return { observations, countOwner: 'Complete authorized canonical notifications before category/unread presentation filters' };
}

export async function checkLateReplyAndReuse({ page, client, workspaceId, taskId, notificationId, hold, release, isHeld }) {
 const preview = page.locator('[data-inbox-preview]'), inboxDraft = 'WU29 fresh draft after old reply', drawerDraft = 'WU29 shared draft edited in Drawer', oldReply = 'WU29 held successful reply';
 const readComments = async () => (await client.api.listComments({ workspaceId, taskId, query: { limit: 200 } })).data.items;
 const before = await readComments();
 await preview.getByRole('textbox', { name: 'Reply', exact: true }).fill(oldReply); await hold('createComment', false); await preview.getByRole('button', { name: 'Reply', exact: true }).click(); await expect.poll(() => isHeld('createComment')).toBe(true);
 await preview.getByRole('button', { name: 'Back', exact: true }).click(); await page.locator(`[data-notification-id="${notificationId}"]`).click(); await page.waitForSelector('[data-conversation-ready]');
 await preview.getByRole('textbox', { name: 'Reply', exact: true }).fill(inboxDraft); await release('createComment');
 await expect.poll(async () => (await readComments()).some(row => row.bodyText === oldReply)).toBe(true);
 await expect(preview.getByRole('textbox', { name: 'Reply', exact: true })).toHaveValue(inboxDraft);
 const canonical = (await readComments()).find(row => row.bodyText === oldReply); assert.ok(canonical); assert.equal((await readComments()).length, before.length + 1);
 const inboxComment = preview.locator(`[data-comment-id="${canonical.id}"]`); await inboxComment.waitFor(); await inboxComment.getByRole('button', { name: 'Add reaction', exact: true }).click(); await page.getByRole('button', { name: 'React 👍', exact: true }).click(); await inboxComment.getByRole('button', { name: '👍 1', exact: true }).waitFor();
 await preview.getByRole('button', { name: 'Open task', exact: true }).click(); const drawer = page.locator(`[data-task-drawer="${taskId}"]`), drawerComment = drawer.locator(`[data-comment-id="${canonical.id}"]`); await drawerComment.getByRole('button', { name: '👍 1', exact: true }).waitFor(); await expect(drawer.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue(inboxDraft); await drawer.getByRole('textbox', { name: 'Comment', exact: true }).fill(drawerDraft);
 await drawerComment.getByRole('button', { name: '👍 1', exact: true }).click(); await expect(drawerComment.getByRole('button', { name: '👍 1', exact: true })).toHaveCount(0); await drawer.getByRole('button', { name: 'Close', exact: true }).click(); await expect(inboxComment.getByRole('button', { name: '👍 1', exact: true })).toHaveCount(0); await expect(preview.getByRole('textbox', { name: 'Reply', exact: true })).toHaveValue(drawerDraft);
 const undo = async () => { await expect.poll(async () => (await readComments()).some(row => row.id === canonical.id)).toBe(false); await page.locator('.ui-toast').filter({ hasText: 'Comment deleted' }).getByRole('button', { name: 'Undo', exact: true }).last().click(); await expect.poll(async () => (await readComments()).some(row => row.id === canonical.id)).toBe(true); };
 await inboxComment.getByRole('button', { name: 'Delete comment', exact: true }).click(); await undo(); await inboxComment.waitFor();
 await preview.getByRole('button', { name: 'Open task', exact: true }).click(); await expect(drawer.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue(drawerDraft); await drawerComment.getByRole('button', { name: 'Delete comment', exact: true }).click(); await undo(); await drawerComment.waitFor(); await drawer.getByRole('button', { name: 'Close', exact: true }).click(); await inboxComment.waitFor(); await expect(preview.getByRole('textbox', { name: 'Reply', exact: true })).toHaveValue(drawerDraft);
 await preview.getByRole('button', { name: 'Back', exact: true }).click();
 for (const route of ['notifications', 'inbox']) { await page.getByRole('navigation', { name: 'Main', exact: true }).locator(`a[href="/w/${workspaceId}/${route}"]`).click(); await page.waitForSelector('[data-notifications-ready]'); }
 await page.locator(`[data-notification-id="${notificationId}"]`).click(); await page.waitForSelector('[data-conversation-ready]'); await expect(preview.getByRole('textbox', { name: 'Reply', exact: true })).toHaveValue(drawerDraft);
 return { commentId: canonical.id, taskId, successfulOldMutation: true, newInboxDraftPreserved: true, canonicalCountBefore: before.length, canonicalCountAfter: (await readComments()).length, sharedReactionInboxToDrawerAndDrawerToInbox: true, deleteUndoOwners: ['Inbox', 'Drawer'], drafts: { inbox: inboxDraft, drawer: drawerDraft, ownership: 'One workspace/task comment draft and revision owner; native Inbox to Drawer edit to Inbox and route away/back retain the same unposted text' } };
}
