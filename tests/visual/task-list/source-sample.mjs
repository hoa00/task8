// Source renderer/styles/helpers untouched. Canonical post-state preparation
// sorts the source fixture input by mapped ascending UUID for DATA-10 tie order.
export async function sourceList(page, sample, identities) {
 await page.waitForFunction(() => window.__gr8r);
 return page.evaluate(async ({ sample, identities }) => {
  const { D, S, allTasks, tasksOf } = await import('/src/core/store.js');
  const { pageTasks } = await import('/src/pages/tasks.js'), { pageMyTasks } = await import('/src/pages/my-tasks.js');
  const { listHtml } = await import('/src/components/task-list.js'), { groupTasks, applyView, viewToolbar } = await import('/src/shell/view-engine.js');
  const lookup = Object.fromEntries(identities.filter(row => row.collection === 'tasks').map(row => [row.sourceId, row.id]));
  D().tasks.sort((a, b) => lookup[a.id].localeCompare(lookup[b.id]));
  const key = sample.scope === 'mine' ? 'mytasks' : sample.scope === 'workspace' ? 'tasks' : 'p:p1';
  const view = { filters: [], q: sample.state === 'no-results' ? 'no matching task WU09' : '', sort: { f: 'manual', dir: 1 }, group: 'status', hidden: ['start', 'created', 'deps'], colW: {}, mode: 'list', showDone: true };
  S.views[key] = view; S.ui.sel = new Set(); S.ui.openTasks = {}; S.ui.collapsedGroups = {}; S.ui.composer = null; S.ui.fx = {}; S.ui.myView = 'list';
  const base = sample.scope === 'mine' ? allTasks().filter(task => task.assignee === D().me) : sample.scope === 'workspace' ? allTasks() : tasksOf('p1');
  const expanded = base.find(task => task.subtasks.length > 0 && task.status !== 'done');
  // Explicit source/target query preparation keeps the required state visible,
  // without changing source rendering or excluding differences from its crop.
  if(sample.state === 'expanded' && expanded) view.q = expanded.key;
  if(sample.state === 'composer') view.q = base.find(task => sample.scope !== 'mine' || task.due && task.due < '2026-10-08' && task.status !== 'done')?.key ?? base[0]?.key ?? '';
  const tasks = applyView(base, sample.scope === 'mine' ? { ...view, sort: { f: 'due', dir: 1 } } : view);
  const groups = groupTasks(tasks, 'status'), visible = groups.flatMap(group => group.tasks);
  if (sample.state === 'selected') visible.slice(0, 2).forEach(task => S.ui.sel.add(task.id));
  if (sample.state === 'expanded' && expanded) S.ui.openTasks[expanded.id] = true;
  if (sample.state === 'composer') S.ui.composer = { ctx: key, group: sample.scope === 'mine' ? 'overdue' : groups[0].key, gb: {} };
  if (sample.state === 'collapsed') S.ui.collapsedGroups[`${key}:${sample.scope === 'mine' ? 'overdue' : groups[0].key}`] = true;
  const metadata = { q: view.q, selectedIds: visible.slice(0,2).map(task=>lookup[task.id]), expandedId: expanded ? lookup[expanded.id] : null, firstKeys: visible.slice(0,2).map(task=>task.key), expandedKey: expanded?.key, groupKey: sample.scope === 'mine' ? 'overdue' : groups[0].key, groupName: sample.scope === 'mine' ? 'Overdue' : groups[0].name };
  if(sample.canonical){S.ui.route=sample.scope==='mine'?'mytasks':'tasks';S.ui.params={};S.ui.collapsed=false;const {render}=await import('/src/shell/render.js');render();return metadata;}
  const section = document.createElement('section'); section.id = 'source-task-list';
  section.innerHTML = sample.scope === 'workspace' ? pageTasks() : sample.scope === 'mine' ? pageMyTasks() : `${viewToolbar(key)}<div class="list-wrap">${listHtml(groups, key, { project: 'p1' })}</div>`;
  const host = document.createElement('div'); host.hidden = true; host.append(...document.body.childNodes); document.body.append(section, host);
  section.querySelectorAll('[data-indet]').forEach(element => { element.indeterminate = true; });
  return metadata;
 }, { sample, identities });
}
