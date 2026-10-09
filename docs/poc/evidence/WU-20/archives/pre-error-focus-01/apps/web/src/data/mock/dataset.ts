import { z } from 'zod';
import { ActivitySchema, CalendarEventSchema, CommentSchema, EntityIdSchema, FileSchema, MemberPreferencesSchema, MemberSchema, NotificationPreferencesSchema, NotificationSchema, ProjectSchema, SavedViewSchema, SubtaskSchema, TaskSchema, TeamSchema, UserProfileSchema, WorkspaceSchema, CountSchema, TaskStatusSchema, VersionSchema, UndoResultSchema, InstantSchema, ClientRequestIdSchema } from '@studio/contracts/api';

const table = <T extends z.ZodType>(schema: T) => z.record(EntityIdSchema, schema).refine(rows => Object.entries(rows).every(([id, row]) => typeof row === 'object' && row !== null && 'id' in row && row.id === id), 'Entity table key differs from ID');
export const MockDatasetSchema = z.strictObject({
  workspaceId: EntityIdSchema, currentMemberId: EntityIdSchema,
  workspaces: table(WorkspaceSchema), users: table(UserProfileSchema), members: table(MemberSchema), teams: table(TeamSchema), projects: table(ProjectSchema), tasks: table(TaskSchema), subtasks: table(SubtaskSchema), comments: table(CommentSchema), files: table(FileSchema), activity: table(ActivitySchema), notifications: table(NotificationSchema), events: table(CalendarEventSchema), savedViews: table(SavedViewSchema),
  taskCommands: z.strictObject({
    descriptionTexts: z.record(EntityIdSchema, z.string()).default(() => ({})),
    taskFavorites: z.record(EntityIdSchema, z.array(EntityIdSchema)).default(() => ({})),
    deletedComments: z.record(EntityIdSchema, InstantSchema).default(() => ({})),
    commentUndoRecords: z.record(EntityIdSchema, z.strictObject({ actorId: EntityIdSchema, commentId: EntityIdSchema, taskId: EntityIdSchema, commentPostVersion: VersionSchema, taskPostVersion: VersionSchema, deletedAt: InstantSchema, result: UndoResultSchema.nullable() })).default(() => ({})),
    deletedFiles: z.record(EntityIdSchema, InstantSchema).default(() => ({})),
    uploadRequests: z.record(EntityIdSchema, z.record(ClientRequestIdSchema, z.strictObject({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), fileId: EntityIdSchema }))).default(() => ({})),
    lifecycleUndoRecords: z.record(EntityIdSchema, z.strictObject({ actorId: EntityIdSchema, kind: z.enum(['task.archive', 'task.delete', 'file.delete']), entityId: EntityIdSchema, postVersion: VersionSchema, lifecycleAt: InstantSchema, previousArchivedAt: InstantSchema.nullable(), taskId: EntityIdSchema.nullable(), taskPostVersion: VersionSchema.nullable(), activityIds: z.array(EntityIdSchema).max(128), result: UndoResultSchema.nullable() })).default(() => ({})),
    deletedTasks: z.record(EntityIdSchema, InstantSchema).default(() => ({})),
    createRequests: z.record(EntityIdSchema, z.record(ClientRequestIdSchema, z.strictObject({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), taskId: EntityIdSchema }))).default(() => ({})),
    deleteUndoRecords: z.record(EntityIdSchema, z.strictObject({ actorId: EntityIdSchema, targets: z.array(z.strictObject({ taskId: EntityIdSchema, postVersion: VersionSchema, deletedAt: InstantSchema })).max(20), activityIds: z.array(EntityIdSchema).max(20), result: UndoResultSchema.nullable() })).default(() => ({})),
    projectSequences: z.record(EntityIdSchema, CountSchema).default(() => ({})),
    previousStatuses: z.record(EntityIdSchema, TaskStatusSchema).default(() => ({})),
    recurrenceSlots: z.record(EntityIdSchema, EntityIdSchema).default(() => ({})),
    columnUndoRecords: z.record(EntityIdSchema, z.strictObject({ actorId: EntityIdSchema, kind: z.enum(['tasks.completeColumn', 'tasks.archiveCompletedColumn']), parents: z.array(z.strictObject({ taskId: EntityIdSchema, postVersion: VersionSchema, status: TaskStatusSchema, completedAt: InstantSchema.nullable(), archivedAt: InstantSchema.nullable(), updatedAt: InstantSchema, previousStatus: TaskStatusSchema.nullable() })).max(20), successors: z.array(z.strictObject({ taskId: EntityIdSchema, sourceTaskId: EntityIdSchema, postVersion: VersionSchema })).max(20), dependencies: z.array(z.strictObject({ taskId: EntityIdSchema, postVersion: VersionSchema })).max(128), activityIds: z.array(EntityIdSchema).max(128), result: UndoResultSchema.nullable() })).default(() => ({})),
    undoRecords: z.record(EntityIdSchema, z.strictObject({ taskId: EntityIdSchema, actorId: EntityIdSchema, postVersion: VersionSchema, previousStatus: TaskStatusSchema, result: UndoResultSchema.nullable() })).default(() => ({})),
  }).default(() => ({ descriptionTexts: {}, deletedComments: {}, commentUndoRecords: {}, taskFavorites: {}, deletedFiles: {}, uploadRequests: {}, lifecycleUndoRecords: {}, deletedTasks: {}, createRequests: {}, deleteUndoRecords: {}, projectSequences: {}, previousStatuses: {}, recurrenceSlots: {}, columnUndoRecords: {}, undoRecords: {} })),
  projectCommands: z.strictObject({
    favorites: z.record(EntityIdSchema, z.array(EntityIdSchema)).default(() => ({})),
    orders: z.record(EntityIdSchema, z.array(EntityIdSchema)).default(() => ({})),
    deletedProjects: z.record(EntityIdSchema, InstantSchema).default(() => ({})),
    deletedBy: z.record(EntityIdSchema, EntityIdSchema).default(() => ({})),
    undoRecords: z.record(EntityIdSchema, z.strictObject({ actorId: EntityIdSchema, projectId: EntityIdSchema, kind: z.enum(['project.archive', 'project.delete']), postVersion: VersionSchema, lifecycleAt: InstantSchema, previousArchivedAt: InstantSchema.nullable(), activityId: EntityIdSchema, result: UndoResultSchema.nullable() })).default(() => ({})),
  }).default(() => ({ favorites: {}, orders: {}, deletedProjects: {}, deletedBy: {}, undoRecords: {} })),
  projectOrder: z.array(EntityIdSchema), preferences: MemberPreferencesSchema, notificationPreferences: NotificationPreferencesSchema,
});
export type MockDataset = z.infer<typeof MockDatasetSchema>;

export function assertDatasetRelations(data: MockDataset): void {
  const requireId = (rows: Record<string, unknown>, id: string | null) => { if (id !== null && !rows[id]) throw new TypeError('Broken mock entity relationship'); };
  requireId(data.workspaces, data.workspaceId);
  requireId(data.members, data.currentMemberId);
  const scope = (row: { workspaceId: string }) => { if (row.workspaceId !== data.workspaceId) throw new TypeError('Cross-workspace mock entity'); };
  for (const member of Object.values(data.members)) { scope(member); requireId(data.users, member.userId); requireId(data.teams, member.teamId); }
  for (const team of Object.values(data.teams)) { scope(team); for (const id of team.memberIds) requireId(data.members, id); }
  for (const project of Object.values(data.projects)) { scope(project); requireId(data.teams, project.teamId); requireId(data.members, project.leadId); for (const id of project.memberIds) requireId(data.members, id); }
  for (const task of Object.values(data.tasks)) { scope(task); requireId(data.projects, task.projectId); requireId(data.members, task.assigneeId); for (const id of task.dependencyIds) requireId(data.tasks, id); }
  for (const subtask of Object.values(data.subtasks)) { requireId(data.tasks, subtask.taskId); requireId(data.members, subtask.assigneeId); }
  for (const comment of Object.values(data.comments)) { scope(comment); requireId(data.tasks, comment.taskId); requireId(data.members, comment.authorId); for (const id of comment.mentionedMemberIds) requireId(data.members, id); for (const reaction of comment.reactions) for (const id of reaction.memberIds) requireId(data.members, id); }
  for (const file of Object.values(data.files)) { scope(file); requireId(data.projects, file.projectId); requireId(data.tasks, file.taskId); requireId(data.members, file.createdBy); if (file.taskId && data.tasks[file.taskId]?.projectId !== file.projectId) throw new TypeError('File project differs from task'); }
  for (const row of Object.values(data.activity)) { requireId(data.members, row.actorId); requireId(data.projects, row.projectId); requireId(data.tasks, row.taskId); }
  for (const row of Object.values(data.notifications)) { scope(row); requireId(data.members, row.recipientId); requireId(data.members, row.actorId); requireId(data.tasks, row.taskId); requireId(data.projects, row.projectId); }
  for (const row of [...Object.values(data.events), ...Object.values(data.savedViews)]) { scope(row); requireId(data.projects, row.projectId); }
  for (const id of data.projectOrder) requireId(data.projects, id);
}
