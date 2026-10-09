export async function sourceTimeline(page, sample, identities, correctRange = true) {
 await page.waitForFunction(() => window.__gr8r);
 return page.evaluate(async ({ sample, identities, correctRange }) => {
  const { D, S, allTasks, tasksOf, visibleProjects, canSee } = await import('/src/core/store.js'), { timelineHtml, tlControls, tlAfter } = await import('/src/views/timeline.js'), { viewToolbar, applyView } = await import('/src/shell/view-engine.js'), { TODAY, addD, iso } = await import('/src/core/utils.js'), { startOfWeek } = await import('/src/views/calendar.js');
  const lookup = Object.fromEntries(identities.filter(row => row.collection === 'tasks').map(row => [row.sourceId, row.id]));
  if (['empty', 'undated'].includes(sample.fixture)) { for (const project of D().projects) project.milestones = []; for (const task of D().tasks) { task.start = null; task.due = null; } }
  if (sample.fixture === 'milestones-only') for (const task of D().tasks) { task.start = null; task.due = null; }
  if (sample.fixture === 'collision') for (const project of D().projects) for (const [index, milestone] of project.milestones.entries()) { milestone.date = index < 2 ? '2026-10-08' : '2026-10-09'; milestone.name = index === 0 ? 'A very long release milestone name that must truncate before the next diamond' : milestone.name; }
  if (sample.fixture === 'outside-range') { D().tasks[0].start = '2027-10-01'; D().tasks[0].due = '2027-10-03'; }
  const key = sample.scope === 'project' ? 'p:p1' : 'tl', view = { filters: sample.filtered ? [{ f: 'status', op: 'is', v: ['progress'] }] : [], q: sample.fixture === 'empty' ? 'no timeline WU15 matches' : '', sort: { f: 'manual', dir: 1 }, group: 'none', hidden: ['start', 'created', 'deps'], colW: {}, mode: 'timeline', showDone: true };
  S.views[key] = view; S.ui.tlZoom = sample.zoom; S.ui.tlGroup = sample.group; S.ui._tlWsInit = 1; S.prefs.weekStart = sample.weekStart ?? 1; S.ui.pop = null; S.ui.fx = {};
  const start = iso(startOfWeek(addD(TODAY, sample.zoom === 'week' ? -21 : -56))), end = iso(addD(new Date(`${start}T00:00:00Z`), (sample.zoom === 'week' ? 91 : 238) - 1));
  const raw = applyView(sample.scope === 'project' ? tasksOf('p1') : allTasks(), view), scoped = raw.filter(task => (task.start || task.due) && (task.due || task.start) >= start && (task.start || task.due) <= end);
  // Same canonical manual query input. Timeline's internal date presentation
  // reverses equal-date input ordinal; API query/cursor ID sorting is unchanged.
  const prepared = [...(correctRange ? scoped : raw)].sort((a, b) => a.order - b.order || lookup[a.id].localeCompare(lookup[b.id]));
  const project = sample.scope === 'project' ? D().projects.find(row => row.id === 'p1') : null;
  const heading = sample.scope === 'project' ? '' : '<div class="ph"><div><h1>Timeline</h1><p>Schedules, dependencies, and milestones across projects.</p></div></div>';
  const html = '<div class="page flush">' + heading + viewToolbar(key, { group: false, extra: tlControls(key) }) + timelineHtml(prepared, key, project) + '</div>';
  if (sample.canonical) { S.ui.route = 'timeline'; S.ui.params = {}; await import('/src/shell/render.js').then(({ render }) => render()); }
  else { let section = document.getElementById('source-timeline'); if (!section) { section = document.createElement('section'); section.id = 'source-timeline'; section.style.height = '100%'; let host = document.createElement('div'); host.id = 'source-timeline-hidden-host'; host.hidden = true; host.append(...document.body.childNodes); document.body.append(section, host); } section.innerHTML = html; tlAfter(); }
  return { key, range: { start, end }, view, rawTaskIds: raw.map(task => task.id), overlapTaskIds: scoped.map(task => task.id), excludedByRange: raw.filter(task => !scoped.includes(task)).map(task => ({ id: task.id, start: task.start, due: task.due })), preparedTaskIds: prepared.map(task => task.id), milestoneCount: (project ? project.milestones : visibleProjects().filter(canSee).flatMap(project => project.milestones)).length, hosts: { app: document.getElementById('app').isConnected, layer: document.getElementById('layer').isConnected }, correction: 'API6.3 explicit overlap input correction; source ignores range. Source due-only renderer, date tie reversal, dependency paint order, template and CSS untouched. DATA10 applies to the upstream query/cursor comparator, not this Timeline presentation. No task position/date/identity modification for ties.' };
 }, { sample, identities, correctRange });
}
