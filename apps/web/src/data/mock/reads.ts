import { BootstrapSchema, catalogs, SessionSchema, TaskSummarySchema } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import type { CapabilitiesDto, ProjectDto, ProjectListItemDto, TaskDto } from '@studio/contracts/api';
import type { MockDataset } from './dataset.ts';

export const mockCapabilities: CapabilitiesDto = {
  dataMode: 'mock', identityMode: 'development',
  features: { projects: 'unavailable', tasks: 'unavailable', teams: 'unavailable', comments: 'unavailable', notificationState: 'unavailable', fileMetadata: 'unavailable', fileBytes: 'unavailable', workspaceProvisioning: 'demoOnly', invitations: 'demoOnly', projectSharing: 'demoOnly', authentication: 'demoOnly', accountSecurity: 'demoOnly', billing: 'demoOnly' },
  limits: { taskPageSize: 50, maxTaskPageSize: 200, maxBulkItems: 20, maxUndoTargets: 128, maxUndoPayloadBytes: 65536, maxUploadBytes: 10485760 },
};

function summarizeTasks(tasks: TaskDto[], clock: Clock) {
  const byStatus = { backlog: 0, todo: 0, progress: 0, review: 0, done: 0 };
  const byPriority = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
  for (const task of tasks) { byStatus[task.status]++; byPriority[task.priority]++; }
  return TaskSummarySchema.parse({ total: tasks.length, byStatus, byPriority, overdue: tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < clock.today()).length, completed: byStatus.done, completionRate: tasks.length ? Math.round(byStatus.done / tasks.length * 100) : 0, subtaskTotals: { total: tasks.reduce((total, task) => total + task.subtaskSummary.total, 0), completed: tasks.reduce((total, task) => total + task.subtaskSummary.completed, 0) } });
}

function projectCatalogItem(data: MockDataset, project: ProjectDto, clock: Clock): ProjectListItemDto {
  if (project.visibility === 'private' && !project.memberIds.includes(data.currentMemberId)) {
    const lead = data.members[project.leadId]!;
    return { access: 'restricted', project: { id: project.id, workspaceId: project.workspaceId, key: project.key, name: project.name, icon: project.icon, color: project.color, status: project.status, dueDate: project.dueDate, lead: { id: lead.id, name: lead.name, avatarColor: lead.avatarColor }, catalogSummary: project.description } };
  }
  const taskSummary = summarizeTasks(Object.values(data.tasks).filter(task => task.projectId === project.id && !task.archivedAt), clock);
  return { access: 'allowed', project, summary: { projectId: project.id, taskSummary, progress: taskSummary.completionRate } };
}

export function readBootstrap(data: MockDataset, clock: Clock) {
  return BootstrapSchema.parse({ workspace: data.workspaces[data.workspaceId], currentMember: data.members[data.currentMemberId], members: Object.values(data.members).map(({ id, name, avatarColor }) => ({ id, name, avatarColor })), teams: Object.values(data.teams), projects: data.projectOrder.map(id => data.projects[id]!).filter(project => !project.archivedAt).map(project => projectCatalogItem(data, project, clock)), catalogs, preferences: data.preferences, notificationPreferences: data.notificationPreferences, unreadCount: Object.values(data.notifications).filter(notification => notification.recipientId === data.currentMemberId && !notification.readAt).length });
}

export function readSession(data: MockDataset) {
  const member = data.members[data.currentMemberId]!;
  return SessionSchema.parse({ user: data.users[member.userId], currentWorkspaceId: data.workspaceId, capabilities: mockCapabilities });
}
