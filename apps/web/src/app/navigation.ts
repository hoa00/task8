import { EntityIdSchema } from '@studio/contracts/api';

export const projectTabs = [
  'overview',
  'board',
  'list',
  'table',
  'calendar',
  'timeline',
  'files',
  'activity',
] as const;
export type ProjectTab = (typeof projectTabs)[number];
export const workspacePages = [
  'home',
  'inbox',
  'my-tasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'projects',
  'tasks',
  'calendar',
  'timeline',
  'members',
  'teams',
  'activity',
  'archive',
] as const;
export type WorkspacePage = (typeof workspacePages)[number];
export const settingsSections = [
  'workspace',
  'appearance',
  'language',
  'datetime',
  'members',
  'teams',
  'projects',
  'permissions',
  'notif-email',
  'notif-push',
  'notif-mentions',
  'notif-assign',
  'profile',
  'preferences',
  'shortcuts',
  'password',
  'sessions',
  '2fa',
  'plan',
  'payment',
  'invoices',
] as const;
export const pageNames: Record<string, string> = {
  home: 'Home',
  inbox: 'Inbox',
  'my-tasks': 'My Tasks',
  favorites: 'Favorites',
  notifications: 'Notifications',
  search: 'Search',
  overview: 'Overview',
  projects: 'Projects',
  tasks: 'Tasks',
  calendar: 'Calendar',
  timeline: 'Timeline',
  members: 'Members',
  teams: 'Teams',
  activity: 'Activity',
  archive: 'Archive',
  settings: 'Settings',
  'design-system': 'Design system',
  'system-states': 'System states',
};
export const links = {
  workspace: (workspaceId: string, page: WorkspacePage = 'home') =>
    `/w/${EntityIdSchema.parse(workspaceId)}/${page}`,
  project: (workspaceId: string, projectId: string, view?: ProjectTab) =>
    `/w/${EntityIdSchema.parse(workspaceId)}/projects/${EntityIdSchema.parse(projectId)}${view ? `/${view}` : ''}`,
  savedView: (workspaceId: string, projectId: string, savedViewId: string) =>
    `/w/${EntityIdSchema.parse(workspaceId)}/projects/${EntityIdSchema.parse(projectId)}/views/${EntityIdSchema.parse(savedViewId)}`,
  settings: (workspaceId: string, section: (typeof settingsSections)[number] = 'appearance') =>
    `/w/${EntityIdSchema.parse(workspaceId)}/settings/${section}`,
  file: (workspaceId: string, projectId: string, fileId: string) =>
    `${links.project(workspaceId, projectId, 'files')}?fileId=${EntityIdSchema.parse(fileId)}`,
  task: (workspaceId: string, taskId: string, page: WorkspacePage = 'tasks') =>
    `${links.workspace(workspaceId, page)}?taskId=${EntityIdSchema.parse(taskId)}`,
};
// Exactly the startup keys present in source ROUTE_NAMES/main.js. No project alias.
export const legacyAliases: Readonly<
  Record<
    string,
    | WorkspacePage
    | 'settings'
    | 'member'
    | 'team'
    | 'system'
    | 'states'
    | 'login'
    | 'signup'
    | 'forgot'
    | 'reset'
    | 'verify'
    | 'onboarding'
  >
> = {
  home: 'home',
  inbox: 'inbox',
  mytasks: 'my-tasks',
  favorites: 'favorites',
  notifications: 'notifications',
  search: 'search',
  overview: 'overview',
  projects: 'projects',
  tasks: 'tasks',
  calendar: 'calendar',
  timeline: 'timeline',
  members: 'members',
  member: 'member',
  teams: 'teams',
  team: 'team',
  activity: 'activity',
  settings: 'settings',
  system: 'system',
  states: 'states',
  archive: 'archive',
  login: 'login',
  signup: 'signup',
  forgot: 'forgot',
  reset: 'reset',
  verify: 'verify',
  onboarding: 'onboarding',
};
export function legacyDestination(hash: string, workspaceId: string): string | undefined {
  const key = hash.replace(/^#/, '');
  if (!Object.hasOwn(legacyAliases, key)) return;
  const alias = legacyAliases[key];
  if (!alias) return;
  if (alias === 'settings') return links.settings(workspaceId);
  if (alias === 'member' || alias === 'team')
    return links.workspace(workspaceId, alias === 'member' ? 'members' : 'teams');
  if (alias === 'system' || alias === 'states')
    return alias === 'system' ? '/dev/design-system' : '/dev/system-states';
  const auth: Record<string, string> = {
    login: '/login',
    signup: '/signup',
    forgot: '/forgot-password',
    reset: '/reset-password',
    verify: '/verify-email',
    onboarding: '/onboarding',
  };
  return auth[alias] ?? links.workspace(workspaceId, alias as WorkspacePage);
}
export interface RouteSearch {
  fileType?: string;
  fileSort?: 'recent' | 'name' | 'type';
  activityProjectId?: string;
  taskId?: string;
  fileId?: string;
  q?: string;
  category?: 'all' | 'tasks' | 'projects' | 'people' | 'files' | 'comments';
  mode?: 'list' | 'board' | 'table' | 'calendar' | 'grid';
  workspaceId?: string;
  view?: string;
  projectStatus?: 'planning' | 'active' | 'risk' | 'hold' | 'complete';
  projectSort?: 'recent' | 'name' | 'due' | 'progress';
}
export function validateRouteSearch(input: Record<string, unknown>): RouteSearch {
  const output: RouteSearch = {};
  for (const key of ['taskId', 'fileId', 'workspaceId', 'activityProjectId'] as const)
    if (EntityIdSchema.safeParse(input[key]).success) output[key] = input[key] as string;
  if (typeof input.view === 'string' && input.view.length <= 16384) output.view = input.view;
  if (
    ['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'].includes(String(input.fileType))
  )
    output.fileType = input.fileType as string;
  if (['recent', 'name', 'type'].includes(String(input.fileSort)))
    output.fileSort = input.fileSort as NonNullable<RouteSearch['fileSort']>;
  if (typeof input.q === 'string') output.q = input.q.slice(0, 500);
  if (['all', 'tasks', 'projects', 'people', 'files', 'comments'].includes(String(input.category)))
    output.category = input.category as NonNullable<RouteSearch['category']>;
  if (['list', 'board', 'table', 'calendar', 'grid'].includes(String(input.mode)))
    output.mode = input.mode as NonNullable<RouteSearch['mode']>;
  if (['planning', 'active', 'risk', 'hold', 'complete'].includes(String(input.projectStatus)))
    output.projectStatus = input.projectStatus as NonNullable<RouteSearch['projectStatus']>;
  if (['recent', 'name', 'due', 'progress'].includes(String(input.projectSort)))
    output.projectSort = input.projectSort as NonNullable<RouteSearch['projectSort']>;
  return output;
}
