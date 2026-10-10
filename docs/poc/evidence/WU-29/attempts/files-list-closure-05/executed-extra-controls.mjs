import assert from 'node:assert/strict';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

export function projectExtraFixture(fixture, dataset, row) {
 if (row.savedType) {
  fixture.data.savedViews.find(view => view.id === 'v1').type = row.savedType;
  dataset.savedViews[sourceId('savedViews', 'v1')].type = row.savedType;
 }
 const changes = [];
 const change = (id, kind, field, source, target, value) => { changes.push({ id, targetId: sourceId(kind, id), kind, field, sourceBefore: source[field], targetBefore: target, after: value }); source[field] = value; };
 if (row.yearFixture) {
  change('t3', 'tasks', 'due', fixture.data.tasks.find(task => task.id === 't3'), dataset.tasks[sourceId('tasks', 't3')].dueDate, '2027-01-06');
  dataset.tasks[sourceId('tasks', 't3')].dueDate = '2027-01-06';
  change('p1', 'projects', 'due', fixture.data.projects.find(project => project.id === 'p1'), dataset.projects[sourceId('projects', 'p1')].dueDate, '2027-01-06');
  dataset.projects[sourceId('projects', 'p1')].dueDate = '2027-01-06';
  const comment = fixture.data.comments.find(comment => comment.task === 't3');
  change(comment.id, 'comments', 'at', comment, dataset.comments[sourceId('comments', comment.id)].createdAt, Date.parse('2025-01-06T09:00:00Z'));
  dataset.comments[sourceId('comments', comment.id)].createdAt = '2025-01-06T09:00:00.000Z';
  const activity = fixture.data.activity[0];
  change(activity.id, 'activity', 'at', activity, dataset.activity[sourceId('activity', activity.id)].createdAt, Date.parse('2025-01-06T09:00:00Z'));
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

export async function visibleYearEvidence(source, target, row, fixtureChanges) {
 if (!row.yearFixture) return null;
 const kind = row.drawer ? 'comments' : row.route === 'activity' ? 'activity' : row.route === 'project' ? 'projects' : 'tasks';
 const record = fixtureChanges.changes.find(change => change.kind === kind);
 assert.ok(record);
 const expected = await source.evaluate(async ({ kind, id }) => {
  const { fmtDate, relDate, ago } = await import('/src/core/utils.js');
  const record = window.__gr8r.S.data[kind].find(record => record.id === id);
  return kind === 'tasks' ? relDate(record.due) : kind === 'projects' ? fmtDate(record.due, true) : ago(record.at);
 }, { kind, id: record.id });
 const observations = [];
 for (const [page, side] of [[source, 'source'], [target, 'target']]) {
  const owner = row.drawer ? side === 'source' ? '.drawer-b' : '.task-drawer-body' : side === 'source' ? '.content' : '#main-content';
  const inspect = () => page.evaluate(async ({ owner, expected, kind, record, side }) => {
   const host = document.querySelector(owner), clip = host.getBoundingClientRect(); let consumer;
   if (kind === 'tasks') consumer = document.querySelector(`[data-task-row="${side === 'source' ? record.id : record.targetId}"]`);
   else if (kind === 'projects') consumer = [...document.querySelectorAll(side === 'source' ? '.pbody dl dt' : '[data-project-overview] dl dt')].find(el => el.textContent === 'Due')?.nextElementSibling;
   else if (kind === 'comments') consumer = side === 'source' ? document.querySelector(`.cmt [data-id="${record.id}"]`)?.closest('.cmt') : document.querySelector(`[data-comment-id="${record.targetId}"]`);
   else if (side === 'target') consumer = document.querySelector(`[data-activity-record="${record.targetId}"]`);
   else {
    const { actHtml } = await import('/src/components/task-list.js');
    const template = document.createElement('template'); template.innerHTML = actHtml(window.__gr8r.S.data.activity.find(item => item.id === record.id), { proj: true });
    const matches = [...document.querySelectorAll('.fitem')].filter(el => el.textContent === template.content.firstElementChild.textContent);
    if (matches.length !== 1) throw Error(`Exact activity consumer mapping: ${matches.length}`); consumer = matches[0];
   }
   if (!consumer) throw Error(`Missing actual ${kind} consumer ${record.id}`);
   const walker = document.createTreeWalker(consumer, NodeFilter.SHOW_TEXT); let node;
   while ((node = walker.nextNode())) {
    if (node.textContent.trim() !== expected) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].map(rect => rect.toJSON());
    const visible = rects.some(rect => rect.width > 0 && rect.height > 0 && rect.y >= Math.max(0, clip.y) && rect.y + rect.height <= Math.min(innerHeight, clip.y + clip.height) && rect.x + rect.width > Math.max(0, clip.x) && rect.x < Math.min(innerWidth, clip.x + clip.width));
    if (visible) return { text: node.textContent, expected, record, consumer: consumer.outerHTML.slice(0, 2000), rects, clip: clip.toJSON(), scrollTop: host.scrollTop };
   }
   return null;
  }, { owner, expected, kind, record, side });
  let actual = await inspect(); const wheel = [];
  for (let n = 0; !actual && n < 12; n++) {
   await page.locator(owner).hover(); await page.mouse.wheel(0, 300); await page.waitForTimeout(120); wheel.push(300); actual = await inspect();
  }
  assert.ok(actual, `${side}/${row.id}: exact requested formatted date must be visibly rendered on its affected record`);
  observations.push({ side, owner, actual, nativeWheel: wheel });
 }
 assert.equal(observations[0].actual.text, observations[1].actual.text, 'Requested older/future date text matches in the actual consumer');
 return observations;
}
