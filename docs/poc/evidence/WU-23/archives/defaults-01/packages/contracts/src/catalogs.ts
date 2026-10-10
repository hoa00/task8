import { z } from 'zod';

export const taskStatuses = [{ id: 'backlog', name: 'Backlog' }, { id: 'todo', name: 'To Do' }, { id: 'progress', name: 'In Progress' }, { id: 'review', name: 'Review' }, { id: 'done', name: 'Done' }] as const;
export const priorities = [{ id: 'urgent', name: 'Urgent', weight: 4 }, { id: 'high', name: 'High', weight: 3 }, { id: 'medium', name: 'Medium', weight: 2 }, { id: 'low', name: 'Low', weight: 1 }, { id: 'none', name: 'No priority', weight: 0 }] as const;
export const projectStatuses = [{ id: 'planning', name: 'Planning', colorToken: 'gray' }, { id: 'active', name: 'In Progress', colorToken: 'blue' }, { id: 'risk', name: 'At Risk', colorToken: 'red' }, { id: 'hold', name: 'On Hold', colorToken: 'amber' }, { id: 'complete', name: 'Completed', colorToken: 'green' }] as const;
export const labels = [{ id: 'design', name: 'Design', colorToken: 'violet' }, { id: 'frontend', name: 'Frontend', colorToken: 'blue' }, { id: 'backend', name: 'Backend', colorToken: 'teal' }, { id: 'research', name: 'Research', colorToken: 'amber' }, { id: 'content', name: 'Content', colorToken: 'rose' }, { id: 'bug', name: 'Bug', colorToken: 'red' }, { id: 'qa', name: 'QA', colorToken: 'green' }, { id: 'growth', name: 'Growth', colorToken: 'orange' }] as const;
export const recurrences = [{ id: 'daily', name: 'Daily' }, { id: 'weekly', name: 'Weekly' }, { id: 'biweekly', name: 'Every 2 weeks' }, { id: 'monthly', name: 'Monthly' }] as const;
export const projectColors = [{ id: 'indigo', color: '#5A67D8' }, { id: 'blue', color: '#3B82C4' }, { id: 'violet', color: '#8662C9' }, { id: 'teal', color: '#23918A' }, { id: 'rose', color: '#C54B78' }, { id: 'amber', color: '#C48A1E' }, { id: 'green', color: '#3D8E5F' }, { id: 'slate', color: '#6B7280' }] as const;
export const projectIcons = ['globe', 'smartphone', 'megaphone', 'rocket', 'component', 'building-2', 'layout-grid', 'palette', 'code', 'briefcase', 'target', 'layers', 'zap', 'heart', 'folder', 'sparkles'] as const;
export const estimates = ['30m', '1h', '2h', '4h', '1d', '2d', '3d', '5d', '8d'] as const;
export const templates = [
  { id: 'blank', name: 'Blank project', icon: 'file', description: 'Start from scratch', tasks: [] },
  { id: 'product', name: 'Product Development', icon: 'target', description: 'Discovery to launch', tasks: ['Define problem statement', 'User research plan', 'Write PRD', 'Design exploration', 'Build MVP', 'Beta launch'] },
  { id: 'web', name: 'Website', icon: 'globe', description: 'IA, design, build, launch', tasks: ['Sitemap & information architecture', 'Wireframes', 'Visual design', 'Build page templates', 'Content migration', 'QA & launch'] },
  { id: 'mkt', name: 'Marketing Campaign', icon: 'megaphone', description: 'Brief, assets, channels', tasks: ['Campaign brief', 'Audience research', 'Creative assets', 'Channel plan', 'Launch campaign', 'Performance report'] },
  { id: 'design', name: 'Design Project', icon: 'palette', description: 'Discovery to handoff', tasks: ['Discovery workshop', 'Moodboard', 'Concept directions', 'Refinement', 'Developer handoff'] },
  { id: 'software', name: 'Software Development', icon: 'code', description: 'Spec, build, ship', tasks: ['Technical spec', 'Set up repo & CI', 'Implement core API', 'Write tests', 'Code review', 'Deploy to staging'] },
  { id: 'personal', name: 'Personal Project', icon: 'heart', description: 'Plan your own goals', tasks: ['Brain dump ideas', 'Pick top 3 priorities', 'Schedule focus time', 'Weekly review'] },
] as const;
export const TaskStatusSchema = z.enum(taskStatuses.map(item => item.id));
export const PrioritySchema = z.enum(priorities.map(item => item.id));
export const ProjectStatusSchema = z.enum(projectStatuses.map(item => item.id));
export const LabelIdSchema = z.enum(labels.map(item => item.id));
export const RecurrenceSchema = z.enum(recurrences.map(item => item.id));
export const ProjectIconSchema = z.enum(projectIcons);
// Source New team defaults to users; its selectable icons share the project picker.
export const TeamIconSchema = z.enum(['users', ...projectIcons]);
export const EstimateSchema = z.enum(estimates);
export const TemplateIdSchema = z.enum(templates.map(item => item.id));
export const RoleSchema = z.enum(['Owner', 'Admin', 'Member', 'Guest']);
export const VisibilitySchema = z.enum(['workspace', 'private']);
export const MemberStatusSchema = z.enum(['active', 'invited']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Recurrence = z.infer<typeof RecurrenceSchema>;
export type LabelId = z.infer<typeof LabelIdSchema>;
export type TemplateId = z.infer<typeof TemplateIdSchema>;
export const CatalogsSchema = z.strictObject({
  taskStatuses: z.array(z.strictObject({ id: TaskStatusSchema, name: z.string() })),
  priorities: z.array(z.strictObject({ id: PrioritySchema, name: z.string(), weight: z.number().int() })),
  projectStatuses: z.array(z.strictObject({ id: ProjectStatusSchema, name: z.string(), colorToken: z.string() })),
  labels: z.array(z.strictObject({ id: LabelIdSchema, name: z.string(), colorToken: z.string() })),
  recurrences: z.array(z.strictObject({ id: RecurrenceSchema, name: z.string() })),
  projectColors: z.array(z.strictObject({ id: z.enum(projectColors.map(item => item.id)), color: z.string() })),
  projectIcons: z.array(ProjectIconSchema), estimates: z.array(EstimateSchema),
  templates: z.array(z.strictObject({ id: TemplateIdSchema, name: z.string(), icon: z.string(), description: z.string(), tasks: z.array(z.string()) })),
});
export const catalogs = CatalogsSchema.parse({ taskStatuses, priorities, projectStatuses, labels, recurrences, projectColors, projectIcons, estimates, templates });
