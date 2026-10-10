import { z } from 'zod';
import * as p from './primitives.ts';
import * as c from './catalogs.ts';

export const FilterOperatorSchema = z.enum(['is', 'not']);
const filter = <T extends z.ZodType, F extends string>(field: F, value: T) => z.strictObject({ field: z.literal(field), op: FilterOperatorSchema, values: z.array(value).max(50) });
export const TaskFilterSchema = z.discriminatedUnion('field', [
  filter('status', c.TaskStatusSchema), filter('assignee', p.MemberIdSchema.nullable()), filter('priority', c.PrioritySchema),
  filter('due', z.enum(['overdue', 'today', 'week', 'later', 'nodate'])), filter('project', p.ProjectIdSchema), filter('labels', c.LabelIdSchema),
  filter('created', z.enum(['1', '7', '30'])), filter('updated', z.enum(['1', '7', '30'])),
]);
export const TaskFiltersSchema = z.array(TaskFilterSchema).max(32);
export const SortFieldSchema = z.enum(['manual', 'title', 'due', 'start', 'priority', 'status', 'assignee', 'created', 'updated', 'estimate', 'project']);
export const SortDirectionSchema = z.enum(['asc', 'desc']);
export const GroupBySchema = z.enum(['none', 'status', 'priority', 'assignee', 'project', 'due']);
export const TaskScopeQuerySchema = z.strictObject({
  projectId: p.ProjectIdSchema.optional(), assigneeId: p.MemberIdSchema.nullable().optional(), favoriteOnly: z.boolean().default(false), archived: z.boolean().default(false),
  q: z.string().max(500).default(''), filters: TaskFiltersSchema.default([]), sortField: SortFieldSchema.default('manual'), sortDirection: SortDirectionSchema.default('asc'),
  rangeFrom: p.DateOnlySchema.optional(), rangeTo: p.DateOnlySchema.optional(), rangeBasis: z.enum(['due', 'overlap']).default('due'),
}).refine(query => !query.rangeFrom || !query.rangeTo || query.rangeFrom <= query.rangeTo, 'Invalid date range');
export const TaskQuerySchema = TaskScopeQuerySchema.safeExtend(p.CursorQuerySchema.shape);
export const MoveScopeSchema = TaskScopeQuerySchema.safeExtend({ groupBy: GroupBySchema.optional(), groupKey: z.union([p.EntityIdSchema, c.TaskStatusSchema, c.PrioritySchema, z.enum(['overdue', 'today', 'week', 'later', 'nodate', 'all']), z.null()]).optional() });
export const ProjectQuerySchema = p.CursorQuerySchema.extend({ q: z.string().max(500).default(''), status: c.ProjectStatusSchema.optional(), archived: z.boolean().default(false), sort: z.enum(['recent', 'name', 'due', 'progress']).default('recent') });
export const MemberQuerySchema = p.CursorQuerySchema.extend({ q: z.string().max(500).default(''), teamId: p.EntityIdSchema.optional(), status: c.MemberStatusSchema.optional() });
export const TextQuerySchema = z.strictObject({ q: z.string().max(500).default('') });
export const ActivityQuerySchema = p.CursorQuerySchema.extend({ projectId: p.ProjectIdSchema.optional(), taskId: p.EntityIdSchema.optional(), actorId: p.MemberIdSchema.optional() });
export const NotificationTypeSchema = z.enum(['mention', 'assign', 'comment', 'update']);
export const NotificationQuerySchema = p.CursorQuerySchema.extend({ category: z.union([z.literal('all'), NotificationTypeSchema]).default('all'), unreadOnly: z.boolean().default(false) });
export const FileQuerySchema = p.CursorQuerySchema.extend({ q: z.string().max(500).default(''), type: z.string().min(1).max(40).optional(), sort: z.enum(['recent', 'name', 'size', 'type']).default('recent') });
export const SearchCategorySchema = z.enum(['all', 'tasks', 'projects', 'people', 'files', 'comments']);
export const SearchQuerySchema = p.CursorQuerySchema.extend({ q: z.string().min(1).max(500), category: SearchCategorySchema.default('all') });
export const DateRangeQuerySchema = z.strictObject({ from: p.DateOnlySchema, to: p.DateOnlySchema, projectId: p.ProjectIdSchema.optional() }).refine(query => query.from <= query.to, 'Invalid date range');
export const MilestoneQuerySchema = z.strictObject(DateRangeQuerySchema.shape).partial().refine(query => !query.from || !query.to || query.from <= query.to, 'Invalid date range');
export const ArchiveQuerySchema = p.CursorQuerySchema.extend({ kind: z.enum(['tasks', 'projects']), q: z.string().max(500).default('') });
// Decoded internal cursor format; adapters own opaque encoding and fingerprint validation.
export const CursorPayloadSchema = z.strictObject({ formatVersion: z.literal(1), queryFingerprint: z.string().regex(/^[a-f0-9]{64}$/), sortField: SortFieldSchema, sortDirection: SortDirectionSchema, sortValue: z.union([z.string().max(500), z.number().finite(), z.null()]), id: p.EntityIdSchema });
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
export type TaskQuery = z.infer<typeof TaskQuerySchema>;
export type TaskScopeQuery = z.infer<typeof TaskScopeQuerySchema>;
export type MoveScope = z.infer<typeof MoveScopeSchema>;
