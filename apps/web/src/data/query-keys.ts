import { EntityIdSchema, operations, TaskQuerySchema } from '@studio/contracts/api';
import type { OperationId, OperationInput } from '@studio/contracts/api';

export const queryKeys = {
  session: () => ['session'] as const,
  authMetadata: () => ['auth-metadata'] as const,
  authContext: () => ['auth-context'] as const,
  workspaces: () => ['workspaces'] as const,
  profile: () => ['profile'] as const,
  workspace: (workspaceId: string) => ['workspace', EntityIdSchema.parse(workspaceId)] as const,
  bootstrap: (workspaceId: string) => [...queryKeys.workspace(workspaceId), 'bootstrap'] as const,
  tasks: (workspaceId: string, query: OperationInput<'listTasks'>['query']) => [...queryKeys.workspace(workspaceId), 'tasks', TaskQuerySchema.parse(query)] as const,
  task: (workspaceId: string, taskId: string) => [...queryKeys.workspace(workspaceId), 'task', EntityIdSchema.parse(taskId)] as const,
};

const readNames: Partial<Record<OperationId, string>> = { getBootstrap: 'bootstrap', getWorkspace: 'workspace', getPreferences: 'preferences', getNotificationPreferences: 'notificationPreferences', listTasks: 'tasks', getTask: 'task', listProjects: 'projects', getProject: 'project', listMembers: 'members', getMember: 'member', listTeams: 'teams', getTeam: 'team', getHome: 'home', getOverview: 'overview', search: 'search', listActivity: 'activity', listNotifications: 'notifications', listCalendarEvents: 'events', listMilestones: 'milestones', listArchive: 'archive', listProjectFiles: 'files', getFile: 'file', listComments: 'comments', listSavedViews: 'savedViews' };

export function operationQueryKey<K extends OperationId>(id: K, input: OperationInput<K>): readonly unknown[] {
  const operation = operations[id];
  if (operation.method !== 'GET') throw new TypeError('Only read operations have query keys');
  const parsed: Record<string, unknown> = operation.request.parse(input);
  const { workspaceId, ...rest } = parsed;
  if (typeof workspaceId === 'string' && id === 'getBootstrap') return queryKeys.bootstrap(workspaceId);
  if (typeof workspaceId === 'string' && id === 'getTask') return queryKeys.task(workspaceId, String(rest.taskId));
  if (typeof workspaceId === 'string' && id === 'listTasks') return queryKeys.tasks(workspaceId, rest.query as OperationInput<'listTasks'>['query']);
  if (typeof workspaceId === 'string') return [...queryKeys.workspace(workspaceId), readNames[id] ?? id, rest];
  if (id === 'getSession') return queryKeys.session();
  if (id === 'listWorkspaces') return queryKeys.workspaces();
  if (id === 'getProfile') return queryKeys.profile();
  throw new TypeError('Workspace read is missing a workspace scope');
}
