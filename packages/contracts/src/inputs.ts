import { z } from 'zod';
import * as p from './primitives.ts';
import * as c from './catalogs.ts';
import * as q from './queries.ts';
import * as m from './models.ts';

export const UpdateWorkspaceInputSchema = z.strictObject({ expectedVersion: p.VersionSchema, name: p.NameSchema.optional(), slug: m.WorkspaceSchema.shape.slug.optional(), iconColor: p.ColorSchema.optional() }).refine(p.nonEmptyPatch, 'Empty PATCH');
export const UpdateProfileInputSchema = z.strictObject({ expectedVersion: p.VersionSchema, name: p.NameSchema.optional(), title: z.string().max(240).optional(), avatarColor: p.ColorSchema.optional() }).refine(p.nonEmptyPatch, 'Empty PATCH');
export const UpdatePreferencesInputSchema = m.MemberPreferencesSchema.partial().extend({ lang: z.enum(['vi', 'en']).optional() }).refine(p.nonEmptyPatch, 'Empty PATCH');
export const UpdateNotificationPreferencesInputSchema = m.NotificationPreferencesSchema.omit({ mentionTeam: true, mentionWorkspace: true, assignStatus: true, assignOverdue: true }).partial().extend({ mentionTeam: z.boolean().optional(), mentionWorkspace: z.boolean().optional(), assignStatus: z.boolean().optional(), assignOverdue: z.boolean().optional() }).refine(p.nonEmptyPatch, 'Empty PATCH');
const projectFields = { name: p.NameSchema, description: z.string().max(10000), icon: c.ProjectIconSchema, color: p.ColorSchema, teamId: p.EntityIdSchema.nullable(), leadId: p.MemberIdSchema, startDate: p.DateOnlySchema.nullable(), dueDate: p.DateOnlySchema.nullable(), status: c.ProjectStatusSchema };
export const CreateProjectInputSchema = z.strictObject({ name: projectFields.name, description: projectFields.description.default(''), icon: projectFields.icon, color: projectFields.color, teamId: projectFields.teamId.default(null), leadId: projectFields.leadId, dueDate: projectFields.dueDate.default(null), templateId: c.TemplateIdSchema });
export const UpdateProjectInputSchema = z.strictObject(projectFields).partial().extend({ expectedVersion: p.VersionSchema }).refine(p.nonEmptyPatch, 'Empty PATCH').refine(p.dateRangeValid, 'startDate exceeds dueDate');
export const DuplicateProjectInputSchema = p.VersionInputSchema.extend({ name: p.NameSchema });
const teamFields = { name: p.NameSchema, description: z.string().max(10000), icon: c.TeamIconSchema, color: p.ColorSchema, memberIds: p.uniqueIds };
export const CreateTeamInputSchema = z.strictObject(teamFields);
export const UpdateTeamInputSchema = CreateTeamInputSchema.partial().extend({ expectedVersion: p.VersionSchema }).refine(p.nonEmptyPatch, 'Empty PATCH');
export const CreateSubtaskDraftSchema = z.strictObject({ title: p.NameSchema, done: z.boolean().default(false), assigneeId: p.MemberIdSchema.nullable().default(null), dueDate: p.DateOnlySchema.nullable().default(null), note: z.string().max(10000).default('') });
const taskFields = { title: p.NameSchema, descriptionHtml: z.string().max(100000), status: c.TaskStatusSchema, assigneeId: p.MemberIdSchema.nullable(), priority: c.PrioritySchema, startDate: p.DateOnlySchema.nullable(), dueDate: p.DateOnlySchema.nullable(), estimate: c.EstimateSchema.nullable(), recurrence: c.RecurrenceSchema.nullable(), labelIds: z.array(c.LabelIdSchema).max(c.labels.length).refine(ids => new Set(ids).size === ids.length, 'Duplicate labels'), dependencyIds: p.uniqueIds };
export const CreateTaskInputSchema = z.strictObject({ clientRequestId: p.ClientRequestIdSchema, projectId: p.ProjectIdSchema, title: taskFields.title, descriptionHtml: taskFields.descriptionHtml.default(''), status: taskFields.status.default('todo'), assigneeId: taskFields.assigneeId.default(null), priority: taskFields.priority.default('none'), startDate: taskFields.startDate.default(null), dueDate: taskFields.dueDate.default(null), estimate: taskFields.estimate.default(null), recurrence: taskFields.recurrence.default(null), labelIds: taskFields.labelIds.default([]), dependencyIds: taskFields.dependencyIds.default([]), subtasks: z.array(CreateSubtaskDraftSchema).max(128).default([]) }).refine(p.dateRangeValid, 'startDate exceeds dueDate');
export const UpdateTaskInputSchema = z.strictObject(taskFields).partial().extend({ expectedVersion: p.VersionSchema }).refine(p.nonEmptyPatch, 'Empty PATCH').refine(p.dateRangeValid, 'startDate exceeds dueDate');
export const SetTaskCompletionInputSchema = p.VersionInputSchema.extend({ completed: z.boolean() });
export const TaskGroupPatchSchema = z.strictObject({ status: c.TaskStatusSchema.optional(), priority: c.PrioritySchema.optional(), assigneeId: p.MemberIdSchema.nullable().optional() }).refine(p.nonEmptyPatch, 'Empty group patch');
export const MoveTaskInputSchema = p.VersionInputSchema.extend({ scope: q.MoveScopeSchema, targetProjectId: p.ProjectIdSchema.optional(), beforeId: p.EntityIdSchema.nullable().optional(), afterId: p.EntityIdSchema.nullable().optional(), groupPatch: TaskGroupPatchSchema.optional() }).refine(input => !input.beforeId || !input.afterId || input.beforeId !== input.afterId, 'Neighbors must differ');
export const DuplicateTaskInputSchema = p.VersionInputSchema.extend({ title: p.NameSchema.optional() });
export const ColumnScopeSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('workspace'), status: c.TaskStatusSchema }), z.strictObject({ kind: z.literal('project'), projectId: p.ProjectIdSchema, status: c.TaskStatusSchema })]);
export const BulkItemSchema = z.strictObject({ id: p.EntityIdSchema, expectedVersion: p.VersionSchema });
const bulkItems = z.array(BulkItemSchema).max(20).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Duplicate bulk target');
export const BulkTaskPatchSchema = z.strictObject({ status: c.TaskStatusSchema.optional(), assigneeId: p.MemberIdSchema.nullable().optional(), priority: c.PrioritySchema.optional(), dueDate: p.DateOnlySchema.nullable().optional() }).refine(p.nonEmptyPatch, 'Empty bulk patch');
export const BulkMutateTasksInputSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('patch'), items: bulkItems.refine(items => items.length > 0), patch: BulkTaskPatchSchema }),
  z.strictObject({ operation: z.literal('delete'), items: bulkItems.refine(items => items.length > 0) }),
  z.strictObject({ operation: z.literal('complete'), items: bulkItems, columnScope: ColumnScopeSchema }),
  z.strictObject({ operation: z.literal('sortPriority'), items: bulkItems, columnScope: ColumnScopeSchema }),
  z.strictObject({ operation: z.literal('archive'), items: bulkItems, columnScope: ColumnScopeSchema.refine(scope => scope.status === 'done', 'Archive requires done column') }),
]);
export const CreateSubtaskInputSchema = CreateSubtaskDraftSchema.extend({ expectedTaskVersion: p.VersionSchema });
export const UpdateSubtaskInputSchema = z.strictObject({ title: p.NameSchema.optional(), done: z.boolean().optional(), assigneeId: p.MemberIdSchema.nullable().optional(), dueDate: p.DateOnlySchema.nullable().optional(), note: z.string().max(10000).optional(), expectedTaskVersion: p.VersionSchema }).refine(p.nonEmptyPatch, 'Empty PATCH');
export const CreateCommentInputSchema = z.strictObject({ bodyText: z.string().trim().min(1).max(10000), mentionedMemberIds: p.uniqueIds.default([]) });
export const UpdateNotificationInputSchema = z.strictObject({ read: z.boolean() });
export const CreateSavedViewInputSchema = z.strictObject({ name: p.NameSchema, type: m.SavedViewSchema.shape.type, filters: q.TaskFiltersSchema.default([]) });
export const UpdateSavedViewInputSchema = z.strictObject({ name: p.NameSchema.optional(), type: m.SavedViewSchema.shape.type.optional(), filters: q.TaskFiltersSchema.optional(), expectedVersion: p.VersionSchema }).refine(p.nonEmptyPatch, 'Empty PATCH');
export const UpdateProjectOrderInputSchema = m.ProjectOrderSchema;
export const RenameFileInputSchema = p.VersionInputSchema.extend({ name: p.NameSchema });
export const DuplicateFileInputSchema = p.VersionInputSchema.extend({ name: p.NameSchema.optional() });
// The adapter converts this normalized binary input to multipart: file + key + optional taskId.
export const UploadFileSchema = z.strictObject({ name: p.NameSchema, mimeType: z.string().min(1).max(240), bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= 10485760, 'File exceeds 10 MiB') });
export const UploadProjectFileInputSchema = z.strictObject({ file: UploadFileSchema, clientRequestId: p.ClientRequestIdSchema, taskId: p.EntityIdSchema.optional() });
export const FileContentQuerySchema = z.strictObject({ disposition: z.enum(['inline', 'attachment']).default('inline') });

export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceInputSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesInputSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof UpdateNotificationPreferencesInputSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
export type DuplicateProjectInput = z.infer<typeof DuplicateProjectInputSchema>;
export type CreateTeamInput = z.infer<typeof CreateTeamInputSchema>;
export type UpdateTeamInput = z.infer<typeof UpdateTeamInputSchema>;
export type CreateSubtaskDraft = z.infer<typeof CreateSubtaskDraftSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;
export type SetTaskCompletionInput = z.infer<typeof SetTaskCompletionInputSchema>;
export type TaskGroupPatch = z.infer<typeof TaskGroupPatchSchema>;
export type MoveTaskInput = z.infer<typeof MoveTaskInputSchema>;
export type DuplicateTaskInput = z.infer<typeof DuplicateTaskInputSchema>;
export type ColumnScope = z.infer<typeof ColumnScopeSchema>;
export type BulkItem = z.infer<typeof BulkItemSchema>;
export type BulkTaskPatch = z.infer<typeof BulkTaskPatchSchema>;
export type BulkMutateTasksInput = z.infer<typeof BulkMutateTasksInputSchema>;
export type CreateSubtaskInput = z.infer<typeof CreateSubtaskInputSchema>;
export type UpdateSubtaskInput = z.infer<typeof UpdateSubtaskInputSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationInputSchema>;
export type CreateSavedViewInput = z.infer<typeof CreateSavedViewInputSchema>;
export type UpdateSavedViewInput = z.infer<typeof UpdateSavedViewInputSchema>;
export type UpdateProjectOrderInput = z.infer<typeof UpdateProjectOrderInputSchema>;
export type RenameFileInput = z.infer<typeof RenameFileInputSchema>;
export type DuplicateFileInput = z.infer<typeof DuplicateFileInputSchema>;
export type UploadFile = z.infer<typeof UploadFileSchema>;
export type UploadProjectFileInput = z.infer<typeof UploadProjectFileInputSchema>;
export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;
