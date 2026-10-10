import { HomeSchema, OverviewSchema } from '@studio/contracts/api';
import { completedInRollingWeek, homeDeadlines, summarizeTasks } from '@studio/domain';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { canReadMockProject } from './project-access.ts';
import { projectTask } from './task-fields.ts';
import { readBootstrap } from './reads.ts';

export const dashboardReads = ['getHome', 'getOverview'] as const;
export function readDashboardScope(data: MockDataset) {
  const projects = Object.values(data.projects).filter(project => canReadMockProject(project, data) && !project.archivedAt);
  const ids = new Set(projects.map(project => project.id));
  const tasks = Object.values(data.tasks).filter(task => task.workspaceId === data.workspaceId && ids.has(task.projectId) && !task.archivedAt && !data.taskCommands.deletedTasks[task.id]);
  return { projects, tasks: tasks.map(task => projectTask(task, data)) };
}
export function readHome(data: MockDataset, clock: Clock) {
  const { tasks, projects } = readDashboardScope(data), ids = new Set(projects.map(project => project.id));
  const mine = tasks.filter(task => task.assigneeId === data.currentMemberId), deadlines = homeDeadlines(tasks, clock.today()).flatMap(group => group.tasks);
  const activity = Object.values(data.activity).filter(row => {
    if (row.projectId && !ids.has(row.projectId) || row.actorId && data.members[row.actorId]?.workspaceId !== data.workspaceId) return false;
    if (!row.taskId) return true;
    const task = data.tasks[row.taskId];
    // Activity can retain an archived task's history, but its canonical parent
    // still owns access even when the optional activity.projectId is null.
    return !!task && task.workspaceId === data.workspaceId && ids.has(task.projectId) && !data.taskCommands.deletedTasks[task.id];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const items = readBootstrap(data, clock).projects.filter(item => item.access === 'allowed' && item.project.status !== 'complete');
  return HomeSchema.parse({ counters: { totalTasks: tasks.length, completedThisWeek: completedInRollingWeek(tasks, clock.now()), overdue: summarizeTasks(tasks, clock.today()).overdue, activeProjects: items.length }, myTasks: { items: mine, total: mine.length }, deadlines: { items: deadlines, total: deadlines.length }, projects: { items, total: items.length }, recentActivity: { items: activity.slice(0, 7), total: activity.length } });
}
export function readOverview(data: MockDataset, clock: Clock) {
  const { tasks } = readDashboardScope(data), projects = readBootstrap(data, clock).projects.filter(item => item.access === 'allowed');
  const workload = Object.values(data.members).filter(member => member.workspaceId === data.workspaceId && member.status === 'active').map(member => ({ member: { id: member.id, name: member.name, avatarColor: member.avatarColor }, openTasks: tasks.filter(task => task.assigneeId === member.id && task.status !== 'done').length })).sort((a, b) => b.openTasks - a.openTasks);
  const milestones = projects.flatMap(item => item.access === 'allowed' ? item.project.milestones : []).filter(row => row.date >= clock.today()).sort((a, b) => a.date > b.date ? 1 : -1).slice(0, 6);
  return OverviewSchema.parse({ taskSummary: summarizeTasks(tasks, clock.today()), projects, workload, milestones });
}
