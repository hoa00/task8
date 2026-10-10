import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

export function projectExtraFixture(fixture, dataset, row) {
 if (row.savedType) {
  fixture.data.savedViews.find(view => view.id === 'v1').type = row.savedType;
  dataset.savedViews[sourceId('savedViews', 'v1')].type = row.savedType;
 }
 if (row.yearFixture) {
  fixture.data.tasks.find(task => task.id === 't3').due = '2027-01-06';
  dataset.tasks[sourceId('tasks', 't3')].dueDate = '2027-01-06';
  fixture.data.projects.find(project => project.id === 'p1').due = '2027-01-06';
  dataset.projects[sourceId('projects', 'p1')].dueDate = '2027-01-06';
  const comment = fixture.data.comments.find(comment => comment.task === 't3');
  comment.at = Date.parse('2025-01-06T09:00:00Z');
  dataset.comments[sourceId('comments', comment.id)].createdAt = '2025-01-06T09:00:00.000Z';
  const activity = fixture.data.activity[0];
  activity.at = Date.parse('2025-01-06T09:00:00Z');
  dataset.activity[sourceId('activity', activity.id)].createdAt = '2025-01-06T09:00:00.000Z';
 }
 return { savedViewType: row.savedType ?? null, yearFixture: row.yearFixture ? { task: 't3', project: 'p1', dueDate: '2027-01-06', oldCommentAndActivity: '2025-01-06T09:00:00.000Z', fixedCurrentYear: 2026 } : null };
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
