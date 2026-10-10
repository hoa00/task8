// Additional independent inventory dimensions; the original 143-row cohort
// remains identifiable and is never relabelled as the whole M2 inventory.
export const extraMatrix = [];
const add = (id, route, extra = {}) => extraMatrix.push({ id, family: 'M2-EXTRA', route, width: 1440, ...extra });
for (const width of [1440, 390]) {
 for (const savedType of ['board', 'table']) add(`EX-saved-${savedType}-${width}`, 'project', { width, params: { id: 'p1', tab: 'v:v1' }, savedType });
 add(`EX-project-week-${width}`, 'project', { width, params: { id: 'p1', tab: 'calendar' }, ui: { calMode: 'week' }, week: true });
 add(`EX-mytasks-week-${width}`, 'mytasks', { width, ui: { myView: 'calendar', calMode: 'week' }, myCalendar: true, week: true });
 add(`EX-timeline-month-${width}`, 'timeline', { width, ui: { tlZoom: 'month' }, timelineMonth: true });
 add(`EX-project-timeline-month-${width}`, 'project', { width, params: { id: 'p1', tab: 'timeline' }, ui: { tlZoom: 'month' }, timelineMonth: true });
 add(`EX-timeline-none-${width}`, 'timeline', { width, ui: { tlGroup: 'none' }, timelineNone: true });
 add(`EX-compact-board-${width}`, 'tasks', { width, taskMode: 'board', targetMode: 'board', prefs: { density: 'compact' } });
}
for (const theme of ['light', 'dark']) for (const accent of ['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite']) add(`EX-accent-overlay-${theme}-${accent}`, 'tasks', { prefs: { theme, accent }, drawer: 't3' });
for (const dateFmt of ['MMM d', 'yyyy-MM-dd', 'M/d', 'd/M']) for (const consumer of ['tasks', 'project', 'activity', 'comments']) add(`EX-date-${dateFmt.replaceAll(' ', '-').replace('/', '-')}-${consumer}`, consumer === 'comments' ? 'tasks' : consumer, { ...(consumer === 'project' ? { params: { id: 'p1', tab: 'overview' } } : {}), ...(consumer === 'comments' ? { drawer: 't3' } : {}), prefs: { dateFmt }, yearFixture: true });
for (const width of [899, 900, 901]) for (const route of ['settings', 'inbox', 'timeline']) add(`EX-boundary-${route}-${width}`, route, { width, height: 1000, ...(route === 'settings' ? { params: { sec: 'appearance' } } : {}) });
for (const width of [639, 640, 641]) for (const variant of ['drawer', 'modal', 'list', 'table', 'calendar']) add(`EX-boundary-${variant}-${width}`, variant === 'calendar' ? 'calendar' : 'tasks', { width, height: 844, ...(variant === 'drawer' ? { drawer: 't3' } : variant === 'modal' ? { newTask: true } : variant === 'table' ? { taskMode: 'table', targetMode: 'table' } : {}) });
for (const width of [1440, 900, 640, 390]) add(`EX-collapsed-${width}`, 'home', { width, height: width <= 640 ? 844 : 1000, ui: { collapsed: true }, collapsed: true });
for (const weekStart of [0, 6]) add(`EX-weekstart-${weekStart}`, 'calendar', { prefs: { weekStart } });
