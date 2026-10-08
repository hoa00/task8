// Independent QA surface: actual locked viewToolbar/popHtml/select enhancer,
// original helpers/styles/font bytes. No source template or style is edited.
export async function sourceTaskControls(page, sample) {
  await page.waitForFunction(() => window.__gr8r);
  return page.evaluate(async sample => {
    const { S } = window.__gr8r;
    const { viewToolbar } = await import('/src/shell/view-engine.js');
    const { popHtml, placePop } = await import('/src/overlays/popovers.js');
    const { enhanceSelects } = await import('/src/ui/select.js');
    S.views.tasks = { filters: sample.filtered ? [{ f: 'status', op: 'is', v: ['progress'] }, { f: 'assignee', op: 'not', v: ['none'] }] : [], q: '', sort: { f: 'manual', dir: 1 }, group: 'status', hidden: ['start', 'created', 'deps'], colW: {}, showDone: true };
    const section = document.createElement('section'); section.id = 'task-toolbar-sample'; section.innerHTML = viewToolbar('tasks', { cols: true });
    const host = document.createElement('div'); host.hidden = true; host.append(...document.body.childNodes); document.body.append(section, host);
    if (sample.menu) { const trigger = section.querySelector(`[data-pop="${sample.menu}"]`); const rect = trigger.getBoundingClientRect(); S.ui.pop = { type: sample.menu, key: 'tasks', x: rect.left, y: rect.bottom + 4, top: rect.top, w: rect.width, q: '', ...(sample.expanded ? { edit: 0 } : {}) }; S.ui.fx = {}; const layer = document.createElement('div'); layer.innerHTML = popHtml(S.ui.pop); document.body.append(...layer.childNodes); enhanceSelects(document.body); placePop(); }
    return { toolbar: section.getBoundingClientRect().toJSON(), popover: document.querySelector('.pop.floating')?.getBoundingClientRect().toJSON() ?? null };
  }, sample);
}
export async function sourceQueryFixtures(page) {
  return page.evaluate(async () => {
    const { D } = await import('/src/core/store.js'); const { matchF, sortTasks, groupTasks } = await import('/src/shell/view-engine.js');
    const base = D().tasks[0];
    const task = (n, patch = {}) => ({ ...base, id: `qa${n}`, key: `QA-${n}`, title: 'Same title', status: 'todo', priority: 'none', due: null, start: null, assignee: null, labels: [], deps: [], estimate: null, order: 1, ...patch });
    const tasks = [task(1, { due: '2026-10-07' }), task(2, { due: '2026-10-08' }), task(3, { due: '2026-10-15' }), task(4, { due: '2026-10-16' }), task(5), task(6, { status: 'done', due: '2026-10-07' })];
    const ties = [task(3), task(2, { due: '2026-10-09' }), task(1, { due: '2026-10-09' })];
    return { dueGroups: groupTasks(tasks, 'due').map(group => [group.key, group.tasks.map(task => task.key)]), unassigned: tasks.filter(task => matchF(task, { f: 'assignee', op: 'is', v: ['none'] })).map(task => task.key), dueAsc: sortTasks(ties, { f: 'due', dir: 1 }).map(task => task.key), dueDesc: sortTasks(ties, { f: 'due', dir: -1 }).map(task => task.key), manualTies: sortTasks(ties, { f: 'manual', dir: 1 }).map(task => task.key) };
  });
}
