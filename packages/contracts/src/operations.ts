import { z } from 'zod';
import * as p from './primitives.ts';
import * as i from './inputs.ts';
import * as q from './queries.ts';
import * as m from './models.ts';

function operation<I extends z.ZodType, O extends z.ZodType>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, request: I, data: O, successStatuses: readonly number[] = [200], requestMediaType: 'application/json' | 'multipart/form-data' = 'application/json') {
  return { method, path, request, data, response: p.apiSuccessSchema(data), successStatuses, transport: 'json' as const, requestMediaType };
}
function binaryOperation<I extends z.ZodType>(path: string, request: I) {
  return { method: 'GET' as const, path, request, data: m.FileContentSchema, response: m.FileContentSchema, successStatuses: [200] as const, transport: 'bytes' as const, requestMediaType: 'application/json' as const };
}
// Contract declarations only: this manifest does not advertise implemented endpoints.
export const operations = {
  getSession: operation('GET', '/api/v1/session', z.strictObject({  }), m.SessionSchema),
  listWorkspaces: operation('GET', '/api/v1/workspaces', z.strictObject({  }), z.array(m.WorkspaceSchema)),
  getBootstrap: operation('GET', '/api/v1/workspaces/{workspaceId}/bootstrap', z.strictObject({ workspaceId: p.EntityIdSchema }), m.BootstrapSchema),
  getWorkspace: operation('GET', '/api/v1/workspaces/{workspaceId}', z.strictObject({ workspaceId: p.EntityIdSchema }), m.WorkspaceSchema),
  updateWorkspace: operation('PATCH', '/api/v1/workspaces/{workspaceId}', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.UpdateWorkspaceInputSchema }), m.WorkspaceSchema),
  getProfile: operation('GET', '/api/v1/me/profile', z.strictObject({  }), m.UserProfileSchema),
  updateProfile: operation('PATCH', '/api/v1/me/profile', z.strictObject({ body: i.UpdateProfileInputSchema }), m.UserProfileSchema),
  getPreferences: operation('GET', '/api/v1/workspaces/{workspaceId}/me/preferences', z.strictObject({ workspaceId: p.EntityIdSchema }), m.MemberPreferencesSchema),
  updatePreferences: operation('PATCH', '/api/v1/workspaces/{workspaceId}/me/preferences', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.UpdatePreferencesInputSchema }), m.MemberPreferencesSchema),
  getNotificationPreferences: operation('GET', '/api/v1/workspaces/{workspaceId}/me/notification-preferences', z.strictObject({ workspaceId: p.EntityIdSchema }), m.NotificationPreferencesSchema),
  updateNotificationPreferences: operation('PATCH', '/api/v1/workspaces/{workspaceId}/me/notification-preferences', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.UpdateNotificationPreferencesInputSchema }), m.NotificationPreferencesSchema),
  listProjects: operation('GET', '/api/v1/workspaces/{workspaceId}/projects', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.ProjectQuerySchema }), p.cursorPageSchema(m.ProjectListItemSchema)),
  createProject: operation('POST', '/api/v1/workspaces/{workspaceId}/projects', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.CreateProjectInputSchema }), m.ProjectMutationSchema, [201]),
  getProject: operation('GET', '/api/v1/workspaces/{workspaceId}/projects/{projectId}', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema }), m.ProjectSchema),
  updateProject: operation('PATCH', '/api/v1/workspaces/{workspaceId}/projects/{projectId}', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: i.UpdateProjectInputSchema }), m.ProjectMutationSchema),
  duplicateProject: operation('POST', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/duplicate', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: i.DuplicateProjectInputSchema }), m.ProjectMutationSchema),
  archiveProject: operation('POST', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/archive', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: p.VersionInputSchema }), m.ProjectMutationSchema),
  restoreProject: operation('POST', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/restore', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: p.VersionInputSchema }), m.ProjectMutationSchema),
  restoreDeletedProject: operation('POST', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/restore-deleted', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: p.VersionInputSchema }), m.ProjectMutationSchema),
  deleteProject: operation('DELETE', '/api/v1/workspaces/{workspaceId}/projects/{projectId}', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: p.VersionInputSchema }), m.ProjectMutationSchema),
  listProjectMembers: operation('GET', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/members', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema }), z.array(m.ProjectMemberSchema)),
  getProjectSummary: operation('GET', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/summary', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema }), m.ProjectSummarySchema),
  listMembers: operation('GET', '/api/v1/workspaces/{workspaceId}/members', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.MemberQuerySchema }), p.cursorPageSchema(m.MemberSchema)),
  getMember: operation('GET', '/api/v1/workspaces/{workspaceId}/members/{memberId}', z.strictObject({ workspaceId: p.EntityIdSchema, memberId: p.MemberIdSchema }), m.MemberSchema),
  getMemberSummary: operation('GET', '/api/v1/workspaces/{workspaceId}/members/{memberId}/summary', z.strictObject({ workspaceId: p.EntityIdSchema, memberId: p.MemberIdSchema }), m.MemberSummarySchema),
  listTeams: operation('GET', '/api/v1/workspaces/{workspaceId}/teams', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.TextQuerySchema }), z.array(m.TeamSchema)),
  createTeam: operation('POST', '/api/v1/workspaces/{workspaceId}/teams', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.CreateTeamInputSchema }), m.TeamMutationSchema, [201]),
  getTeam: operation('GET', '/api/v1/workspaces/{workspaceId}/teams/{teamId}', z.strictObject({ workspaceId: p.EntityIdSchema, teamId: p.EntityIdSchema }), m.TeamSchema),
  updateTeam: operation('PATCH', '/api/v1/workspaces/{workspaceId}/teams/{teamId}', z.strictObject({ workspaceId: p.EntityIdSchema, teamId: p.EntityIdSchema, body: i.UpdateTeamInputSchema }), m.TeamMutationSchema),
  deleteTeam: operation('DELETE', '/api/v1/workspaces/{workspaceId}/teams/{teamId}', z.strictObject({ workspaceId: p.EntityIdSchema, teamId: p.EntityIdSchema, body: p.VersionInputSchema }), m.TeamMutationSchema),
  getTeamSummary: operation('GET', '/api/v1/workspaces/{workspaceId}/teams/{teamId}/summary', z.strictObject({ workspaceId: p.EntityIdSchema, teamId: p.EntityIdSchema }), m.TeamSummarySchema),
  listTasks: operation('GET', '/api/v1/workspaces/{workspaceId}/tasks', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.TaskQuerySchema }), p.cursorPageSchema(m.TaskSchema)),
  getTaskSummary: operation('GET', '/api/v1/workspaces/{workspaceId}/tasks/summary', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.TaskScopeQuerySchema }), m.TaskSummarySchema),
  getTask: operation('GET', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema }), m.TaskDetailSchema),
  resolveTaskKey: operation('GET', '/api/v1/workspaces/{workspaceId}/task-keys/{taskKey}', z.strictObject({ workspaceId: p.EntityIdSchema, taskKey: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/) }), m.TaskDetailSchema),
  createTask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.CreateTaskInputSchema }), m.TaskMutationSchema, [200, 201]),
  updateTask: operation('PATCH', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: i.UpdateTaskInputSchema }), m.TaskMutationSchema),
  setTaskCompletion: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/completion', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: i.SetTaskCompletionInputSchema }), m.TaskMutationSchema),
  moveTask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/move', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: i.MoveTaskInputSchema }), m.TaskMutationSchema),
  duplicateTask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/duplicate', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: i.DuplicateTaskInputSchema }), m.TaskMutationSchema),
  archiveTask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/archive', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: p.VersionInputSchema }), m.TaskMutationSchema),
  restoreTask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/restore', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: p.VersionInputSchema }), m.TaskMutationSchema),
  restoreDeletedTask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/restore-deleted', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: p.VersionInputSchema }), m.TaskMutationSchema),
  deleteTask: operation('DELETE', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: p.VersionInputSchema }), m.TaskMutationSchema),
  bulkMutateTasks: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/bulk', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.BulkMutateTasksInputSchema }), m.BulkTaskMutationSchema),
  createSubtask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: i.CreateSubtaskInputSchema }), m.TaskDetailSchema, [201]),
  updateSubtask: operation('PATCH', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, subtaskId: p.EntityIdSchema, body: i.UpdateSubtaskInputSchema }), m.TaskDetailSchema),
  deleteSubtask: operation('DELETE', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, subtaskId: p.EntityIdSchema, body: p.TaskVersionInputSchema }), m.TaskDetailSchema),
  promoteSubtask: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}/promote', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, subtaskId: p.EntityIdSchema, body: p.TaskVersionInputSchema }), m.TaskMutationSchema),
  undoCommand: operation('POST', '/api/v1/workspaces/{workspaceId}/undo/{undoId}', z.strictObject({ workspaceId: p.EntityIdSchema, undoId: p.EntityIdSchema, body: p.EmptyInputSchema }), m.UndoResultSchema),
  listComments: operation('GET', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/comments', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, query: p.CursorQuerySchema }), p.cursorPageSchema(m.CommentSchema)),
  createComment: operation('POST', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/comments', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema, body: i.CreateCommentInputSchema }), m.CommentMutationSchema, [201]),
  deleteComment: operation('DELETE', '/api/v1/workspaces/{workspaceId}/comments/{commentId}', z.strictObject({ workspaceId: p.EntityIdSchema, commentId: p.EntityIdSchema, body: p.VersionInputSchema }), m.CommentMutationSchema),
  restoreDeletedComment: operation('POST', '/api/v1/workspaces/{workspaceId}/comments/{commentId}/restore-deleted', z.strictObject({ workspaceId: p.EntityIdSchema, commentId: p.EntityIdSchema, body: p.VersionInputSchema }), m.CommentMutationSchema),
  addCommentReaction: operation('PUT', '/api/v1/workspaces/{workspaceId}/comments/{commentId}/reactions/{reactionKey}', z.strictObject({ workspaceId: p.EntityIdSchema, commentId: p.EntityIdSchema, reactionKey: m.ReactionKeySchema }), z.array(m.ReactionSchema)),
  removeCommentReaction: operation('DELETE', '/api/v1/workspaces/{workspaceId}/comments/{commentId}/reactions/{reactionKey}', z.strictObject({ workspaceId: p.EntityIdSchema, commentId: p.EntityIdSchema, reactionKey: m.ReactionKeySchema }), z.array(m.ReactionSchema)),
  listActivity: operation('GET', '/api/v1/workspaces/{workspaceId}/activity', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.ActivityQuerySchema }), p.cursorPageSchema(m.ActivitySchema)),
  listNotifications: operation('GET', '/api/v1/workspaces/{workspaceId}/notifications', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.NotificationQuerySchema }), m.NotificationsPageSchema),
  updateNotification: operation('PATCH', '/api/v1/workspaces/{workspaceId}/notifications/{notificationId}', z.strictObject({ workspaceId: p.EntityIdSchema, notificationId: p.EntityIdSchema, body: i.UpdateNotificationInputSchema }), m.NotificationSchema),
  readAllNotifications: operation('POST', '/api/v1/workspaces/{workspaceId}/notifications/read-all', z.strictObject({ workspaceId: p.EntityIdSchema }), m.ReadAllNotificationsSchema),
  listSavedViews: operation('GET', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/views', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema }), z.array(m.SavedViewSchema)),
  createSavedView: operation('POST', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/views', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: i.CreateSavedViewInputSchema }), m.SavedViewSchema, [201]),
  updateSavedView: operation('PATCH', '/api/v1/workspaces/{workspaceId}/views/{viewId}', z.strictObject({ workspaceId: p.EntityIdSchema, viewId: p.EntityIdSchema, body: i.UpdateSavedViewInputSchema }), m.SavedViewSchema),
  deleteSavedView: operation('DELETE', '/api/v1/workspaces/{workspaceId}/views/{viewId}', z.strictObject({ workspaceId: p.EntityIdSchema, viewId: p.EntityIdSchema, body: p.VersionInputSchema }), m.SavedViewDeleteSchema),
  addTaskFavorite: operation('PUT', '/api/v1/workspaces/{workspaceId}/me/task-favorites/{taskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema }), m.TaskFavoriteSchema),
  removeTaskFavorite: operation('DELETE', '/api/v1/workspaces/{workspaceId}/me/task-favorites/{taskId}', z.strictObject({ workspaceId: p.EntityIdSchema, taskId: p.EntityIdSchema }), m.TaskFavoriteSchema),
  addProjectFavorite: operation('PUT', '/api/v1/workspaces/{workspaceId}/me/project-favorites/{projectId}', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema }), m.ProjectFavoriteSchema),
  removeProjectFavorite: operation('DELETE', '/api/v1/workspaces/{workspaceId}/me/project-favorites/{projectId}', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema }), m.ProjectFavoriteSchema),
  updateProjectOrder: operation('PUT', '/api/v1/workspaces/{workspaceId}/me/project-order', z.strictObject({ workspaceId: p.EntityIdSchema, body: i.UpdateProjectOrderInputSchema }), m.ProjectOrderSchema),
  listProjectFiles: operation('GET', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/files', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, query: q.FileQuerySchema }), p.cursorPageSchema(m.FileSchema)),
  getFile: operation('GET', '/api/v1/workspaces/{workspaceId}/files/{fileId}', z.strictObject({ workspaceId: p.EntityIdSchema, fileId: p.EntityIdSchema }), m.FileSchema),
  renameFile: operation('PATCH', '/api/v1/workspaces/{workspaceId}/files/{fileId}', z.strictObject({ workspaceId: p.EntityIdSchema, fileId: p.EntityIdSchema, body: i.RenameFileInputSchema }), m.FileSchema),
  duplicateFile: operation('POST', '/api/v1/workspaces/{workspaceId}/files/{fileId}/duplicate', z.strictObject({ workspaceId: p.EntityIdSchema, fileId: p.EntityIdSchema, body: i.DuplicateFileInputSchema }), m.FileSchema),
  deleteFile: operation('DELETE', '/api/v1/workspaces/{workspaceId}/files/{fileId}', z.strictObject({ workspaceId: p.EntityIdSchema, fileId: p.EntityIdSchema, body: p.VersionInputSchema }), m.FileMutationSchema),
  restoreDeletedFile: operation('POST', '/api/v1/workspaces/{workspaceId}/files/{fileId}/restore-deleted', z.strictObject({ workspaceId: p.EntityIdSchema, fileId: p.EntityIdSchema, body: p.VersionInputSchema }), m.FileSchema),
  uploadProjectFile: operation('POST', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/files', z.strictObject({ workspaceId: p.EntityIdSchema, projectId: p.ProjectIdSchema, body: i.UploadProjectFileInputSchema }), m.FileSchema, [200, 201], 'multipart/form-data'),
  getFileContent: binaryOperation('/api/v1/workspaces/{workspaceId}/files/{fileId}/content', z.strictObject({ workspaceId: p.EntityIdSchema, fileId: p.EntityIdSchema, query: i.FileContentQuerySchema })),
  getHome: operation('GET', '/api/v1/workspaces/{workspaceId}/home', z.strictObject({ workspaceId: p.EntityIdSchema }), m.HomeSchema),
  getOverview: operation('GET', '/api/v1/workspaces/{workspaceId}/overview', z.strictObject({ workspaceId: p.EntityIdSchema }), m.OverviewSchema),
  search: operation('GET', '/api/v1/workspaces/{workspaceId}/search', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.SearchQuerySchema }), m.SearchSchema),
  listCalendarEvents: operation('GET', '/api/v1/workspaces/{workspaceId}/calendar-events', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.DateRangeQuerySchema }), z.array(m.CalendarEventSchema)),
  listMilestones: operation('GET', '/api/v1/workspaces/{workspaceId}/milestones', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.MilestoneQuerySchema }), z.array(m.MilestoneSchema)),
  listArchive: operation('GET', '/api/v1/workspaces/{workspaceId}/archive', z.strictObject({ workspaceId: p.EntityIdSchema, query: q.ArchiveQuerySchema }), p.cursorPageSchema(m.ArchiveItemSchema)),
} as const;
export type OperationId = keyof typeof operations;
export type OperationInput<K extends OperationId> = z.input<(typeof operations)[K]['request']>;
export type OperationOutput<K extends OperationId> = z.output<(typeof operations)[K]['response']>;
type StudioOperations = { [K in OperationId]: (input: OperationInput<K>) => Promise<OperationOutput<K>> };
export interface StudioApi extends StudioOperations {
  getSession: StudioOperations['getSession'];
}
export const externalServices = {
  workspaceProvisioning: { mock: 'demoOnly', http: 'unavailable' }, invitations: { mock: 'demoOnly', http: 'unavailable' },
  projectSharing: { mock: 'demoOnly', http: 'unavailable' }, authentication: { mock: 'demoOnly', http: 'unavailable' },
  accountSecurity: { mock: 'demoOnly', http: 'unavailable' }, billing: { mock: 'demoOnly', http: 'unavailable' },
} as const satisfies { [K in 'workspaceProvisioning' | 'invitations' | 'projectSharing' | 'authentication' | 'accountSecurity' | 'billing']: { mock: 'demoOnly'; http: 'unavailable' } };
