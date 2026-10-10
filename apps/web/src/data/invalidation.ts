import { operations } from '@studio/contracts/api';
import type { OperationId, OperationInput } from '@studio/contracts/api';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys.ts';

const taskProjections = ['task', 'tasks', 'getTaskSummary', 'project', 'projects', 'getProjectSummary', 'home', 'overview', 'getMemberSummary', 'getTeamSummary', 'members', 'teams', 'search', 'activity', 'archive', 'bootstrap', 'milestones'] as const;
const teamProjections = ['team', 'teams', 'getTeamSummary', 'member', 'members', 'getMemberSummary', 'project', 'projects', 'getProjectSummary', 'bootstrap', 'home', 'overview', 'search', 'activity'] as const;
const projectProjections = [...taskProjections, 'files', 'file', 'comments', 'savedViews'] as const;
export const operationInvalidations: Partial<Record<OperationId, readonly string[]>> = {
  renameFile: [...taskProjections, 'files', 'file'], duplicateFile: [...taskProjections, 'files', 'file'], deleteFile: [...taskProjections, 'files', 'file'], uploadProjectFile: [...taskProjections, 'files', 'file'],
  createTeam: teamProjections, updateTeam: teamProjections, deleteTeam: teamProjections,
  updateNotification: ['notifications', 'bootstrap'], readAllNotifications: ['notifications', 'bootstrap'],
  createTask: taskProjections, updateTask: taskProjections, setTaskCompletion: taskProjections, moveTask: [...taskProjections, 'files', 'file'], duplicateTask: taskProjections, archiveTask: taskProjections, restoreTask: taskProjections, restoreDeletedTask: taskProjections, deleteTask: taskProjections, bulkMutateTasks: taskProjections,
  createSubtask: taskProjections, updateSubtask: taskProjections, deleteSubtask: taskProjections, promoteSubtask: taskProjections,
  createProject: projectProjections, updateProject: projectProjections, duplicateProject: projectProjections, archiveProject: projectProjections, restoreProject: projectProjections, restoreDeletedProject: projectProjections, deleteProject: projectProjections,
  createComment: [...taskProjections, 'comments', 'notifications'], deleteComment: [...taskProjections, 'comments'], restoreDeletedComment: [...taskProjections, 'comments'], addCommentReaction: [...taskProjections, 'comments'], removeCommentReaction: [...taskProjections, 'comments'],
  updatePreferences: ['preferences', 'bootstrap'], updateNotificationPreferences: ['notificationPreferences', 'bootstrap'], updateProjectOrder: ['bootstrap', 'projects'],
};

export function invalidationKeys<K extends OperationId>(id: K, input: OperationInput<K>): readonly (readonly unknown[])[] {
  const operation = operations[id];
  if (operation.method === 'GET') return [];
  const parsed: Record<string, unknown> = operation.request.parse(input);
  if (id === 'updateProfile') return [queryKeys.profile(), queryKeys.session(), ['workspace']];
  if (typeof parsed.workspaceId !== 'string') throw new TypeError('Mutation requires a workspace scope');
  const root = queryKeys.workspace(parsed.workspaceId);
  // Unknown future mutation mappings invalidate only their entire workspace.
  return operationInvalidations[id]?.map(resource => [...root, resource]) ?? [root];
}

export async function invalidateOperation<K extends OperationId>(queryClient: QueryClient, id: K, input: OperationInput<K>): Promise<void> {
  await Promise.all(invalidationKeys(id, input).map(queryKey => queryClient.invalidateQueries({ queryKey })));
}

export async function cancelWorkspaceQueries(queryClient: QueryClient, workspaceId: string): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryKeys.workspace(workspaceId) });
}
