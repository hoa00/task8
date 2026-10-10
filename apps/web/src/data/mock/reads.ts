import { BootstrapSchema, catalogs, SessionSchema } from '@studio/contracts/api';
import { summarizeTasks as summarizeTaskDomain } from '@studio/domain';
import type { Clock } from '@studio/domain';
import type { CapabilitiesDto, ProjectDto, ProjectListItemDto, TaskDto } from '@studio/contracts/api';
import type { MockDataset } from './dataset.ts';
import { visibleNotifications } from './notifications.ts';

export const mockCapabilities: CapabilitiesDto = {
  dataMode: 'mock', identityMode: 'development',
  features: { projects: 'implemented', tasks: 'unavailable', teams: 'implemented', comments: 'unavailable', notificationState: 'implemented', fileMetadata: 'unavailable', fileBytes: 'unavailable', workspaceProvisioning: 'demoOnly', invitations: 'demoOnly', projectSharing: 'demoOnly', authentication: 'demoOnly', accountSecurity: 'demoOnly', billing: 'demoOnly' },
  limits: { taskPageSize: 50, maxTaskPageSize: 200, maxBulkItems: 20, maxUndoTargets: 128, maxUndoPayloadBytes: 65536, maxUploadBytes: 10485760 },
};

function summarizeTasks(tasks: TaskDto[], clock: Clock) { return summarizeTaskDomain(tasks, clock.today()); }

export function projectCatalogItem(data: MockDataset, project: ProjectDto, clock: Clock): ProjectListItemDto {
  if (project.visibility === 'private' && !project.memberIds.includes(data.currentMemberId)) {
    const lead = data.members[project.leadId]!;
    return { access: 'restricted', project: { id: project.id, workspaceId: project.workspaceId, key: project.key, name: project.name, icon: project.icon, color: project.color, status: project.status, dueDate: project.dueDate, lead: { id: lead.id, name: lead.name, avatarColor: lead.avatarColor }, catalogSummary: project.description } };
  }
  const taskSummary = summarizeTasks(Object.values(data.tasks).filter(task => task.projectId === project.id && !task.archivedAt && !data.taskCommands.deletedTasks[task.id]), clock);
  return { access: 'allowed', project: { ...project, isFavorite: (data.projectCommands.favorites[data.currentMemberId] ?? []).includes(project.id) }, summary: { projectId: project.id, taskSummary, progress: taskSummary.completionRate } };
}

// Lifecycle tombstones are internal records, not public DTO fields. The current
// foundation seed has none; these guards keep the projection compatible with
// deletedAt when later feature owners add internal lifecycle records.
function notDeleted(record: { id: string; deletedAt?: string | null }): boolean { return !record.deletedAt; }
export function readNavigationCounts(data: MockDataset, clock: Clock) {
  const authorized = (project: ProjectDto | undefined): project is ProjectDto => !!project && !data.projectCommands.deletedProjects[project.id] && project.workspaceId === data.workspaceId && (project.visibility !== 'private' || project.memberIds.includes(data.currentMemberId));
  const tasks = Object.values(data.tasks).filter(task => { const project = data.projects[task.projectId]; return task.workspaceId === data.workspaceId && !data.taskCommands.deletedTasks[task.id] && notDeleted(task) && authorized(project) && notDeleted(project); });
  const inbox = visibleNotifications(data).filter(notification => !notification.readAt && notification.type !== 'update').length;
  return { inbox, myTasks: tasks.filter(task => !task.archivedAt && !data.projects[task.projectId]!.archivedAt && task.assigneeId === data.currentMemberId && task.status !== 'done' && task.dueDate && task.dueDate <= clock.today()).length,
    archive: tasks.filter(task => task.archivedAt).length + Object.values(data.projects).filter(project => project.archivedAt && authorized(project) && notDeleted(project)).length };
}

export function readBootstrap(data: MockDataset, clock: Clock) {
  const notifications = visibleNotifications(data).filter(notification => !notification.readAt);
  const order = [...new Set([...(data.projectCommands.orders[data.currentMemberId] ?? data.projectOrder), ...data.projectOrder])];
  return BootstrapSchema.parse({ workspace: data.workspaces[data.workspaceId], currentMember: data.members[data.currentMemberId], members: Object.values(data.members).map(({ id, name, avatarColor }) => ({ id, name, avatarColor })), teams: Object.values(data.teams).filter(team => !data.teamCommands.deletedTeams[team.id]), projects: order.map(id => data.projects[id]!).filter(project => project && !project.archivedAt && !data.projectCommands.deletedProjects[project.id]).map(project => projectCatalogItem(data, project, clock)), catalogs, preferences: data.preferences, notificationPreferences: data.notificationPreferences, unreadCount: notifications.length, navigationCounts: readNavigationCounts(data, clock) });
}

export function readSession(data: MockDataset) {
  const member = data.members[data.currentMemberId]!;
  return SessionSchema.parse({ user: data.users[member.userId], currentWorkspaceId: data.workspaceId, capabilities: mockCapabilities });
}
