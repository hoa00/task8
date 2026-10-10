import assert from 'node:assert/strict';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

export function projectExtraFixture(fixture, dataset, row) {
 if (row.savedType) {
  fixture.data.savedViews.find(view => view.id === 'v1').type = row.savedType;
  dataset.savedViews[sourceId('savedViews', 'v1')].type = row.savedType;
 }
 const changes = [];
 const change = (id, field, source, target, value) => { changes.push({ id, field, sourceBefore: source[field], targetBefore: target, after: value }); source[field] = value; };
 if (row.yearFixture) {
  change('t3', 'due', fixture.data.tasks.find(task => task.id === 't3'), dataset.tasks[sourceId('tasks', 't3')].dueDate, '2027-01-06');
  dataset.tasks[sourceId('tasks', 't3')].dueDate = '2027-01-06';
  change('p1', 'due', fixture.data.projects.find(project => project.id === 'p1'), dataset.projects[sourceId('projects', 'p1')].dueDate, '2027-01-06');
  dataset.projects[sourceId('projects', 'p1')].dueDate = '2027-01-06';
  const comment = fixture.data.comments.find(comment => comment.task === 't3');
  change(comment.id, 'at', comment, dataset.comments[sourceId('comments', comment.id)].createdAt, Date.parse('2025-01-06T09:00:00Z'));
  dataset.comments[sourceId('comments', comment.id)].createdAt = '2025-01-06T09:00:00.000Z';
  const activity = fixture.data.activity[0];
  change(activity.id, 'at', activity, dataset.activity[sourceId('activity', activity.id)].createdAt, Date.parse('2025-01-06T09:00:00Z'));
  dataset.activity[sourceId('activity', activity.id)].createdAt = '2025-01-06T09:00:00.000Z';
 }
 return { changes, savedViewType: row.savedType ?? null, yearFixture: row.yearFixture ? { task: 't3', project: 'p1', dueDate: '2027-01-06', oldCommentAndActivity: '2025-01-06T09:00:00.000Z', fixedCurrentYear: 2026 } : null };
}

export async function extraControls(source, target, row) {
 const actions = [];
 if (row.timelineMonth) { await target.getByRole('radio', { name: 'Months', exact: true }).press('Space'); actions.push('Target native Months radio Space; Source original tlZoom fixture state'); }
 if (row.timelineNone) { await target.getByRole('button', { name: 'Group by', exact: true }).click(); await target.getByRole('option', { name: 'No grouping', exact: true }).click(); actions.push('Target native Group by/No grouping; Source original tlGroup fixture state'); }
 if (row.drawer) {
  await source.locator(`[data-a="openTask"][data-id="${row.drawer}"]`).first().click();
  await target.locator(`[data-task-row="${sourceId('tasks', row.drawer)}"]`).getByRole('button', { name: /^Open / }).click();
  await source.locator('.drawer').waitFor(); await target.locator('[data-task-drawer]').waitFor();
  actions.push('Both actual task title native click to the shared Drawer, original finite overlay entrance retained');
 }
 if (row.newTask) {
  await source.locator('[data-a="newTask"]').first().click();
  await target.getByRole('button', { name: 'New task', exact: true }).first().click();
  await source.locator('.modal').waitFor(); await target.locator('[data-task-form=create]').waitFor();
  actions.push('Both actual New task native button to full task form');
 }
 return actions;
}

export async function visibleYearEvidence(source, target, row) {
 if (!row.yearFixture) return null;
 const year = row.drawer || row.route === 'activity' ? '2025' : '2027';
 const observations = [];
 for (const [page, side] of [[source, 'source'], [target, 'target']]) {
  const owner = row.drawer ? side === 'source' ? '.drawer-b' : '.task-drawer-body' : side === 'source' ? '.content' : '#main-content';
  const inspect = () => page.evaluate(({ owner, year }) => {
   const host = document.querySelector(owner), clip = host.getBoundingClientRect(), walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT); let node;
   while ((node = walker.nextNode())) {
    if (!node.textContent.includes(year)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].map(rect => rect.toJSON());
    const visible = rects.some(rect => rect.width > 0 && rect.height > 0 && rect.y >= Math.max(0, clip.y) && rect.y + rect.height <= Math.min(innerHeight, clip.y + clip.height) && rect.x + rect.width > Math.max(0, clip.x) && rect.x < Math.min(innerWidth, clip.x + clip.width));
    if (visible) return { text: node.textContent, year, rects, clip: clip.toJSON(), scrollTop: host.scrollTop };
   }
   return null;
  }, { owner, year });
  let actual = await inspect(); const wheel = [];
  for (let n = 0; !actual && n < 12; n++) {
   await page.locator(owner).hover(); await page.mouse.wheel(0, 300); await page.waitForTimeout(120); wheel.push(300); actual = await inspect();
  }
  assert.ok(actual, `${side}/${row.id}: requested year must be visibly rendered`);
  observations.push({ side, owner, actual, nativeWheel: wheel });
 }
 assert.equal(observations[0].actual.text, observations[1].actual.text, 'Requested older/future date text matches in the actual consumer');
 return observations;
}
