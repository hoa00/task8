import { readJson, artifacts } from '../reference/source-check.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

export const workspaceId = sourceId('workspaces', 'w1');
export const shellBase = readJson(`${artifacts}/scenario-registry.json`).scenarios.filter(row => /^(SC-|PR-|SE-)/.test(row.id));
export function targetPath(row) {
  const root = `/w/${workspaceId}`;
  if (row.route === 'system') return '/dev/design-system';
  if (row.route === 'states') return '/dev/system-states';
  if (row.route === 'project') {
    const base = `${root}/projects/${sourceId('projects', row.params.id)}`;
    return row.params.tab.startsWith('v:') ? `${base}/views/${sourceId('savedViews', row.params.tab.slice(2))}` : `${base}/${row.params.tab}`;
  }
  if (row.route === 'member') return `${root}/members/${sourceId('members', row.params.id)}`;
  if (row.route === 'team') return `${root}/teams/${sourceId('teams', row.params.id)}`;
  if (row.route === 'settings') return `${root}/settings/${row.params?.sec ?? 'appearance'}`;
  return `${root}/${row.route === 'mytasks' ? 'my-tasks' : row.route}`;
}
export const shellMatrix = [1440, 390].flatMap(width => shellBase.map(row => ({ ...row, width, id: `${row.id}-${width}` })));
const add = (id, route, extra = {}) => shellMatrix.push({ id, family: id.startsWith('DIM') ? id.split('-').slice(0, 2).join('-') : 'VW', route, width: 1440, ...extra });
for (const width of [639, 640, 641, 899, 900, 901, 1099, 1100, 1101]) add(`DIM-BOUNDARY-${width}`, 'home', { width });
for (const theme of ['light', 'dark']) for (const accent of ['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite']) add(`DIM-05-${theme}-${accent}`, 'tasks', { prefs: { theme, accent }, targetMode: 'list' });
for (const colorScheme of ['light', 'dark']) add(`DIM-05-system-${colorScheme}`, 'home', { prefs: { theme: 'system' }, colorScheme });
for (const side of ['comfortable', 'compact']) for (const density of ['comfortable', 'compact']) add(`DIM-density-${side}-${density}`, 'tasks', { prefs: { side, density }, targetMode: 'list' });
for (const width of [1440, 390]) {
  for (const targetMode of ['board', 'table']) add(`VW-${targetMode}-${width}`, 'tasks', { width, taskMode: targetMode, targetMode });
  add(`VW-projects-list-${width}`, 'projects', { width, ui: { projView: 'list' }, catalogueMode: 'List' });
  add(`VW-projects-table-${width}`, 'projects', { width, ui: { projView: 'table' }, catalogueMode: 'Table' });
  add(`VW-files-list-${width}`, 'project', { width, params: { id: 'p1', tab: 'files' }, ui: { fileView: 'list' }, filesList: true });
  add(`VW-calendar-week-${width}`, 'calendar', { width, ui: { calMode: 'week' }, week: true });
  add(`VW-mytasks-calendar-${width}`, 'mytasks', { width, ui: { myView: 'calendar' }, myCalendar: true });
}
