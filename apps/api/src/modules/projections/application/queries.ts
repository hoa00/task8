import { TaskQuerySchema } from '@studio/contracts/api';
import {
  selectedTaskProjections,
  taskReadPlan,
  taskQuerySummary,
} from '../../tasks/projections.ts';
import { homeTaskCounters, overviewWorkload } from '../persistence/dashboard.ts';
import type {
  DateRangeQuerySchema,
  MemberDto,
  MilestoneQuerySchema,
  TaskQuery,
} from '@studio/contracts/api';
import { CalendarEventSchema, EntityIdSchema, MilestoneSchema } from '@studio/contracts/api';
import { addDateDays, homeDeadlines } from '@studio/domain';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { listActivity } from '../../activity/index.ts';
import { projectRow } from '../../projects/access.ts';
import { taskDto } from '../../tasks/projections.ts';
import { today } from '../../workspaces/index.ts';
import { calendarRead } from '../persistence/queries.ts';
import { readBootstrap } from './bootstrap.ts';
export async function home(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  now: number,
) {
  const date = await today(r, s, now),
    bootstrap = await readBootstrap(r, s, actor, now);
  const projects = bootstrap.projects.filter(
    (project) => project.access === 'allowed' && project.project.status !== 'complete',
  );
  const counters = await homeTaskCounters(r, s, now, date);
  const mine = (await selectedTaskProjections(r, s, { kind: 'mine', memberId: s.memberId })).map(
    taskDto,
  );
  const deadlineTasks = (
    await selectedTaskProjections(r, s, { kind: 'deadlines', from: date, to: addDateDays(date, 7) })
  ).map(taskDto);
  const deadlines = homeDeadlines(deadlineTasks, date).flatMap((group) => group.tasks),
    recentActivity = await listActivity(r, s, { limit: 7 });
  return {
    counters: { ...counters, activeProjects: projects.length },
    myTasks: { items: mine, total: mine.length },
    deadlines: { items: deadlines, total: deadlines.length },
    projects: { items: projects, total: projects.length },
    recentActivity: { items: recentActivity.items, total: recentActivity.total },
  };
}
export async function overview(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  now: number,
) {
  const date = await today(r, s, now),
    bootstrap = await readBootstrap(r, s, actor, now),
    projects = bootstrap.projects.filter((project) => project.access === 'allowed');
  const query: TaskQuery = TaskQuerySchema.parse({});
  const taskSummary = await taskQuerySummary(r, taskReadPlan(s, query, { today: date, now }));
  const workload = (await overviewWorkload(r, s)).map((row) => ({
    member: { id: EntityIdSchema.parse(row.id), name: row.name, avatarColor: row.avatarColor },
    openTasks: row.openTasks,
  }));
  const milestones = projects
    .flatMap((project) => (project.access === 'allowed' ? project.project.milestones : []))
    .filter((milestone) => milestone.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, 6);
  return { taskSummary, projects, workload, milestones };
}
export async function calendar(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof DateRangeQuerySchema> | z.infer<typeof MilestoneQuerySchema>,
  milestones = false,
) {
  if (query.projectId)
    await projectRow(r, s, query.projectId, {
      visibility: 'child',
      lifecycle: 'detail',
      access: 'read',
    });
  const table = milestones ? 'projectMilestones' : 'calendarEvents';
  const rows = await calendarRead(r, table, query, milestones, s);
  return rows.map((row) =>
    milestones ? MilestoneSchema.parse(row) : CalendarEventSchema.parse(row),
  );
}
export { archive } from './archive.ts';
export { search } from './search.ts';
