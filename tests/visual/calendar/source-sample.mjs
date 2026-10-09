export async function sourceCalendar(page, sample, identities) {
 await page.waitForFunction(() => window.__gr8r);
 return page.evaluate(async ({ sample, identities }) => {
  const { D, S, allTasks, tasksOf } = await import('/src/core/store.js'), { calendarHtml, pageWsCalendar } = await import('/src/views/calendar.js'), { pageMyTasks } = await import('/src/pages/my-tasks.js'), { applyView, viewToolbar } = await import('/src/shell/view-engine.js');
  const lookup = Object.fromEntries(identities.filter(row => row.collection === 'tasks').map(row => [row.sourceId, row.id]));
  D().tasks.sort((a, b) => lookup[a.id].localeCompare(lookup[b.id]));
  D().events.sort((a, b) => identities.find(row => row.collection === 'events' && row.sourceId === a.id).id.localeCompare(identities.find(row => row.collection === 'events' && row.sourceId === b.id).id));
  const moved = [];
  if (sample.state === 'overflow') for (const task of D().tasks.filter(task => !task.archived && (sample.scope === 'mine' ? task.assignee === D().me : task.project === 'p1')).slice(0, 4)) { task.due = '2026-10-13'; task.start = null; moved.push(task.id); }
  const key = sample.scope === 'workspace' ? 'cal' : sample.scope === 'mine' ? 'mytasks' : 'p:p1';
  const filters = sample.state === 'project-filter' ? [{ f: 'project', op: 'is', v: ['p1'] }] : sample.state === 'filtered' ? [{ f: 'status', op: 'is', v: ['progress'] }] : [];
  const view = { filters, q: sample.state === 'empty' ? 'no calendar WU14 matches' : '', sort: { f: sample.scope === 'mine' ? 'due' : 'manual', dir: 1 }, group: 'none', hidden: ['start', 'created', 'deps'], colW: {}, mode: 'calendar', showDone: true };
  S.views[key] = view; S.ui.calDate = sample.date ?? '2026-10-08'; S.ui.calMode = sample.mode; S.ui.myView = 'calendar'; S.prefs.weekStart = sample.weekStart ?? 1; S.ui.pop = null; S.ui.fx = {};
  const tasks = applyView(sample.scope === 'project' ? tasksOf('p1') : allTasks().filter(task => sample.scope !== 'mine' || task.assignee === D().me), view);
  // Task-specific filters do not belong to read-only events. Project filters do.
  const rawEvents = structuredClone(D().events);
  if (sample.state === 'project-filter') D().events = D().events.filter(event => event.project === 'p1');
  if (sample.canonical) { S.ui.route = sample.scope === 'mine' ? 'mytasks' : 'calendar'; S.ui.params = {}; await import('/src/shell/render.js').then(({ render }) => render()); return { key, view, moved, rawEvents, correctedEvents: structuredClone(D().events), tasks: tasks.map(task => task.id) }; }
  const section = document.createElement('section'); section.id = 'source-calendar'; section.style.height = '100%'; section.style.display = 'block';
  section.innerHTML = sample.scope === 'workspace' ? pageWsCalendar() : sample.scope === 'mine' ? pageMyTasks() : '<div class="page flush">' + viewToolbar(key, { group: false }) + calendarHtml(tasks, { key, project: 'p1', events: true }) + '</div>';
  let host = document.getElementById('source-calendar-hidden-host'); if (!host) { host = document.createElement('div'); host.id = 'source-calendar-hidden-host'; host.hidden = true; host.append(...document.body.childNodes); } document.body.append(section, host);
  return { key, view, moved, rawEvents, correctedEvents: structuredClone(D().events), tasks: tasks.map(task => task.id), hosts: { app: document.getElementById('app').isConnected, layer: document.getElementById('layer').isConnected } };
 }, { sample, identities });
}

export async function sourceOverflow(page, sample, correct = true) {
 return page.evaluate(async ({ sample, correct }) => {
  const { D, S, allTasks } = await import('/src/core/store.js'), { applyView } = await import('/src/shell/view-engine.js'), { A } = await import('/src/actions/actions.js');
  const key = sample.scope === 'workspace' ? 'cal' : sample.scope === 'mine' ? 'mytasks' : 'p:p1', date = '2026-10-13';
  const scoped = applyView(allTasks().filter(task => sample.scope !== 'project' || task.project === 'p1').filter(task => sample.scope !== 'mine' || task.assignee === D().me), S.views[key]);
  const taskIds = new Set(scoped.map(task => task.id));
  const original = { tasks: allTasks().filter(task => task.due === date).map(task => ({ id: task.id, project: task.project, title: task.title })), events: D().events.filter(event => event.date === date).map(event => ({ ...event })) };
  const corrected = { tasks: scoped.filter(task => task.due === date).map(task => ({ id: task.id, project: task.project, title: task.title })), events: original.events.filter(event => sample.scope !== 'mine' && (sample.scope !== 'project' || event.project === 'p1')) };
  document.body.append(document.getElementById('layer'));
  S.ui.pop = null;
  A.pop(document.querySelector(`#source-calendar [data-pop=daylist][data-date="${date}"]`));
  const bugHtml = document.querySelector('#layer .pop')?.innerHTML;
  if (!correct) return { date, original, corrected, bugHtml };
  // Symmetric correction fixture: keep the actual popHtml markup/styles, but
  // restrict its original workspace inputs to precisely the displayed dataset.
  D().tasks = scoped;
  D().events = D().events.filter(event => sample.scope !== 'mine' && (sample.scope !== 'project' || event.project === 'p1'));
  await import('/src/shell/render.js').then(({ render }) => render());
  return { date, original, corrected, excludedTasks: original.tasks.filter(task => !taskIds.has(task.id)), excludedEvents: original.events.filter(event => !corrected.events.some(row => row.id === event.id)), bugHtml, correctedHtml: document.querySelector('#layer .pop')?.innerHTML, correction: 'QUIRK-02 scoped input fixture in canonical displayed order (DATA-10);  original popHtml/template/styles untouched; target uses displayed full canonical range tasks/events.' };
 }, { sample, correct });
}
