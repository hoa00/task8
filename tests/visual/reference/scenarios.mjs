import { artifacts, readJson } from './source-check.mjs';

const fixture = readJson(`${artifacts}/source-fixture.json`);
const projectId = fixture.data.projects.find(p => !p.private && !p.archived).id;
const taskId = fixture.data.tasks.find(t => t.project === projectId && t.subtasks.length && t.attachments.length).id;
const scenarios = [];
const add = (id, family, route, extra = {}) => scenarios.push({ id, family, route, state: 'base', ...extra });
const routes = ['home', 'inbox', 'mytasks', 'favorites', 'notifications', 'search', 'overview', 'projects', 'project', 'tasks', 'calendar', 'timeline', 'members', 'member', 'teams', 'team', 'activity', 'settings', 'system', 'states', 'archive'];
routes.forEach((route, index) => add(`SC-${String(index + 1).padStart(2, '0')}-base`, `SC-${String(index + 1).padStart(2, '0')}`, route, {
  params: route === 'project' ? { id: projectId, tab: 'board' } : route === 'member' ? { id: fixture.data.me } : route === 'team' ? { id: fixture.data.teams[0].id } : {},
}));
['overview', 'board', 'list', 'table', 'calendar', 'timeline', 'files', 'activity'].forEach((tab, index) => add(`PR-${String(index + 1).padStart(2, '0')}-${tab}`, `PR-${String(index + 1).padStart(2, '0')}`, 'project', { params: { id: projectId, tab } }));
fixture.data.savedViews.forEach(view => add(`PR-SV-${view.id}`, 'PR-SV', 'project', { params: { id: view.project, tab: `v:${view.id}` } }));
['workspace', 'appearance', 'language', 'datetime', 'members', 'teams', 'projects', 'permissions', 'notif-email', 'notif-push', 'notif-mentions', 'notif-assign', 'profile', 'preferences', 'shortcuts', 'password', 'sessions', '2fa', 'plan', 'payment', 'invoices'].forEach((sec, index) => add(`SE-${String(index + 1).padStart(2, '0')}-${sec}`, `SE-${String(index + 1).padStart(2, '0')}`, 'settings', { params: { sec } }));
['login', 'signup', 'forgot', 'forgot-sent', 'reset', 'reset-done', 'verify'].forEach((auth, index) => add(`AU-${String(index + 1).padStart(2, '0')}-${auth}`, `AU-${String(index + 1).padStart(2, '0')}`, 'home', { auth }));
for (let onb = 0; onb < 6; onb++) add(`ON-0${onb + 1}-step-${onb}`, `ON-0${onb + 1}`, 'home', { auth: 'onboarding', ui: { onb, onbData: { use: 'product', team: 'kanban', size: '2-10', ws: 'Gr8r Studio', proj: 'Website Launch', tmpl: 'web', invites: '' } } });
['task', 'project', 'share', 'invite', 'confirm', 'prompt', 'shortcuts', 'team', 'filePreview', 'saveView'].forEach((modal, index) => add(`MD-${String(index + 1).padStart(2, '0')}-${modal}`, `MD-${String(index + 1).padStart(2, '0')}`, 'project', { params: { id: projectId, tab: 'list' }, modal }));
const popovers = ['create', 'ws', 'user', 'help', 'status', 'priority', 'assignee', 'labels', 'project', 'recur', 'estimate', 'deps', 'date', 'subassignee', 'pstatus', 'role', 'sort', 'group', 'cols', 'filter', 'fvals', 'daylist', 'event', 'emoji', 'ctx', 'bulk-status', 'bulk-priority', 'bulk-assignee'];
popovers.forEach(popover => add(`PO-${popover}`, `PO-${popover}`, popover === 'event' || popover === 'daylist' ? 'calendar' : popover === 'pstatus' ? 'project' : popover === 'role' ? 'members' : 'tasks', { popover, params: popover === 'pstatus' ? { id: projectId, tab: 'board' } : {}, drawer: ['status', 'priority', 'assignee', 'labels', 'project', 'recur', 'estimate', 'deps', 'date', 'subassignee', 'emoji'].includes(popover) ? taskId : undefined, subtask: popover === 'subassignee', taskMode: popover === 'cols' ? 'table' : 'list' }));
['side', 'full', 'activity', 'rich-text', 'subtask', 'attachment', 'comment', 'nested-modal'].forEach((state, index) => add(`DR-0${index + 1}-${state}`, `DR-0${index + 1}`, 'tasks', { state, drawer: taskId, drawerFull: state === 'full', drawerTab: state === 'activity' ? 'activity' : 'comments', drawerScroll: ['activity', 'comment'].includes(state) ? 'bottom' : state === 'attachment' ? 650 : undefined, subtask: state === 'subtask', modal: state === 'nested-modal' ? 'confirm' : undefined }));
for (const taskMode of ['board', 'table']) add(`VW-${taskMode}`, `VW-${taskMode.toUpperCase()}`, 'tasks', { taskMode });
add('VW-calendar-week', 'VW-CAL', 'calendar', { ui: { calMode: 'week' } });
add('VW-mytasks-calendar', 'VW-CAL', 'mytasks', { ui: { myView: 'calendar' } });
add('VW-files-list', 'VW-FILES', 'project', { params: { id: projectId, tab: 'files' }, ui: { fileView: 'list' } });
add('VW-projects-table', 'VW-PROJECTS', 'projects', { ui: { projView: 'table' } });
add('VW-inbox-selected', 'SC-02', 'inbox', { ui: { inboxSel: fixture.data.notifs[0].id } });
add('ST-search-results', 'SC-06', 'search', { ui: { searchQ: 'design' } });
add('ST-search-empty', 'SC-06', 'search', { ui: { searchQ: 'zz-no-source-results' } });
add('ST-project-denied', 'SC-09', 'project', { params: { id: fixture.data.projects.find(p => p.private && !p.members.includes(fixture.data.me)).id, tab: 'board' } });
add('ST-project-missing', 'SC-09', 'project', { params: { id: 'missing-source-project', tab: 'board' } });
add('ST-loading', 'SC-20', 'home', { ui: { loading: true } });
add('ST-offline', 'SC-20', 'home', { ui: { offline: true } });
add('ST-bulk', 'VW-LIST', 'tasks', { selected: true });
add('ST-palette', 'PALETTE', 'home', { palette: 'cmd' });
add('ST-palette-search', 'PALETTE', 'home', { palette: 'search' });
add('ST-toast', 'TOAST', 'home', { toast: true });
add('ST-auth-validation', 'AU-01', 'home', { auth: 'login', clicks: ['[data-a="doLogin"]'] });
add('ST-task-validation', 'MD-01', 'tasks', { modal: 'task', clicks: ['[data-a="submitTask"]'] });
add('ST-2fa-setup', 'SE-18', 'settings', { params: { sec: '2fa' }, clicks: ['[data-a="setup2fa"]'] });
const mobile = { viewport: { width: 390, height: 844 }, mobile: true };
for (const route of ['home', 'inbox', 'tasks', 'calendar', 'timeline', 'settings']) add(`MOBILE-${route}`, 'DIM-04', route, mobile);
for (const taskMode of ['board', 'table']) add(`MOBILE-${taskMode}`, 'DIM-04', 'tasks', { ...mobile, taskMode });
add('MOBILE-files', 'DIM-04', 'project', { ...mobile, params: { id: projectId, tab: 'files' } });
add('MOBILE-drawer', 'DIM-04', 'tasks', { ...mobile, drawer: taskId });
add('MOBILE-modal', 'DIM-04', 'tasks', { ...mobile, modal: 'task' });
add('MOBILE-nav', 'DIM-04', 'home', { ...mobile, clicks: ['[data-a="openMnav"]'] });
add('MOBILE-auth', 'DIM-04', 'home', { ...mobile, auth: 'login' });
for (const width of [639, 640, 641, 899, 900, 901, 1099, 1100, 1101]) add(`BOUNDARY-${width}`, 'DIM-BOUNDARY', 'home', { viewport: { width, height: width < 700 ? 844 : 1000 } });
for (const theme of ['light', 'dark']) for (const accent of ['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite']) add(`THEME-${theme}-${accent}`, 'DIM-05', 'tasks', { prefs: { theme, accent }, modal: 'task' });
for (const colorScheme of ['light', 'dark']) add(`THEME-system-${colorScheme}`, 'DIM-05', 'home', { prefs: { theme: 'system' }, colorScheme });
add('DENSITY-content', 'DIM-07', 'tasks', { prefs: { density: 'compact' } });
add('DENSITY-sidebar', 'DIM-06', 'tasks', { prefs: { side: 'compact' } });
add('DENSITY-board', 'DIM-07', 'tasks', { prefs: { density: 'compact' }, taskMode: 'board' });
add('SIDEBAR-collapsed', 'DIM-08', 'home', { ui: { collapsed: true } });
for (const motion of ['system', 'reduce', 'full']) add(`MOTION-${motion}`, 'DIM-09', 'tasks', { prefs: { motion }, drawer: taskId });
for (const scenario of scenarios) {
  scenario.setup = 'Fresh context → fixed Date/seed/platform → gr8r.v2 fixture → source debug route/state → source action/recorded clicks → font/image/motion/geometry readiness';
  scenario.settleRender = true;
  scenario.setup += ' → source render() again after motion to retire one-shot motion layers → readiness again; see settled-render-probes.json';
}

export { scenarios, projectId, taskId };
