import { normalizeDescription } from '@studio/domain';
import { ActivitySchema, CalendarEventSchema, CommentSchema, FileSchema, MemberPreferencesSchema, MemberSchema, NotificationPreferencesSchema, NotificationSchema, ProjectSchema, SavedViewSchema, SubtaskSchema, TaskSchema, TeamSchema, UserProfileSchema, WorkspaceSchema, projectColors } from '@studio/contracts/api';
import { sourceFixtureProvenance, sourceId } from '@studio/contracts/source-identities';
import { createFixedClock } from '@studio/domain';
import type { Clock } from '@studio/domain';
import sourceFixture from '../../../../docs/poc/reference/source-fixture.json' with { type: 'json' };
import type { WorkspaceDto, UserProfileDto, MemberDto, TeamDto, ProjectDto, TaskDto, SubtaskDto, CommentDto, FileDto, ActivityDto, NotificationDto, CalendarEventDto, SavedViewDto, MemberPreferencesDto, NotificationPreferencesDto, EntityId } from '@studio/contracts/api';
export interface SeedDataset {
  workspaceId: EntityId; currentMemberId: EntityId; workspaces: Record<string, WorkspaceDto>; users: Record<string, UserProfileDto>;
  members: Record<string, MemberDto>; teams: Record<string, TeamDto>; projects: Record<string, ProjectDto>; tasks: Record<string, TaskDto>;
  subtasks: Record<string, SubtaskDto>; comments: Record<string, CommentDto>; files: Record<string, FileDto>; activity: Record<string, ActivityDto>;
  notifications: Record<string, NotificationDto>; events: Record<string, CalendarEventDto>; savedViews: Record<string, SavedViewDto>;
  projectOrder: EntityId[]; preferences: MemberPreferencesDto; notificationPreferences: NotificationPreferencesDto;
}

export const fixtureClock = createFixedClock(sourceFixtureProvenance.clock);
export const seedProvenance = sourceFixtureProvenance;
const rowsById = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map(row => [row.id, row]));
const instant = (epoch: number) => new Date(epoch).toISOString();
const source = sourceFixture.data;

// Only this mapper knows legacy IDs/sentinels. Fixture dates/instants remain pinned;
// the injected clock supplies missing source timestamps and derived read calculations.
export function createSeedFixture(clock: Clock = fixtureClock): SeedDataset {
  const workspaceId = sourceId('workspaces', source.workspaces[0]!.id);
  const currentMemberId = sourceId('members', source.me);
  const timestamp = clock.now();
  const workspaces = source.workspaces.map((workspace, index) => WorkspaceSchema.parse({
    id: sourceId('workspaces', workspace.id), name: workspace.name, planLabel: workspace.plan,
    slug: index === 0 ? source.ws.url : workspace.name.toLowerCase().replaceAll(' ', '-'), iconColor: workspace.c,
    brand: workspace.brand ?? false, timezone: 'UTC', createdAt: timestamp, updatedAt: timestamp, version: 1,
  }));
  const users = source.members.map(member => UserProfileSchema.parse({ id: sourceId('users', member.id), name: member.name, email: member.email, title: member.title, avatarColor: member.c, timezone: member.tz, version: 1 }));
  const members = source.members.map(member => MemberSchema.parse({ id: sourceId('members', member.id), workspaceId, userId: sourceId('users', member.id), name: member.name, email: member.email, title: member.title, avatarColor: member.c, timezone: member.tz, role: member.role, status: member.status, teamId: member.team ? sourceId('teams', member.team) : null, lastSeenAt: member.last === null ? null : instant(Date.parse(timestamp) - member.last * 60000), version: 1 }));
  const teams = source.teams.map(team => TeamSchema.parse({ id: sourceId('teams', team.id), workspaceId, name: team.name, description: team.desc, icon: team.icon, color: team.c, memberIds: members.filter(member => member.teamId === sourceId('teams', team.id)).map(member => member.id), createdAt: timestamp, updatedAt: timestamp, version: 1 }));
  const projects = source.projects.map(project => ProjectSchema.parse({ id: sourceId('projects', project.id), workspaceId, key: project.key, name: project.name, description: project.desc, icon: project.icon, color: projectColors.find(color => color.id === project.color)!.color, status: project.status, teamId: project.team ? sourceId('teams', project.team) : null, leadId: sourceId('members', project.lead), startDate: project.start, dueDate: project.due, visibility: project.private ? 'private' : 'workspace', memberIds: project.members.map(id => sourceId('members', id)), milestones: project.milestones.map((milestone, index) => ({ id: sourceId('milestones', `${project.id}:${index}`), workspaceId, projectId: sourceId('projects', project.id), name: milestone.name, date: milestone.date, position: index * 100 })), isFavorite: project.fav, archivedAt: null, createdAt: timestamp, updatedAt: timestamp, lastActivityAt: instant(Date.parse(timestamp) - project.last * 60000), version: 1 }));
  const files = source.files.map(file => FileSchema.parse({ id: sourceId('files', file.id), workspaceId, projectId: sourceId('projects', file.project), taskId: file.task ? sourceId('tasks', file.task) : null, name: file.name, fileType: file.type, mimeType: null, sizeBytes: null, displaySize: file.size, storageMode: 'sample', contentAvailable: false, createdBy: sourceId('members', file.by), createdAt: instant(file.at), version: 1 }));
  const subtasks = source.tasks.flatMap(task => task.subtasks.map((subtask, index) => SubtaskSchema.parse({ id: sourceId('subtasks', subtask.id), taskId: sourceId('tasks', task.id), title: subtask.title, done: subtask.done, assigneeId: null, dueDate: null, note: '', position: index * 100 })));
  const comments = source.comments.map(comment => CommentSchema.parse({ id: sourceId('comments', comment.id), workspaceId, taskId: sourceId('tasks', comment.task), authorId: sourceId('members', comment.by), bodyText: comment.text, mentionedMemberIds: source.members.filter(member => comment.text.includes(`@${member.name}`)).map(member => sourceId('members', member.id)), createdAt: instant(comment.at), version: 1, reactions: Object.entries(comment.re).map(([key, memberIds]) => ({ key, count: memberIds!.length, memberIds: memberIds!.map(id => sourceId('members', id)) })) }));
  const tasks = source.tasks.map(task => {
    // Source duplicates attachment metadata inside t3. Resolve to the existing file entity.
    for (const attachment of task.attachments) {
      if (!files.some(file => file.taskId === sourceId('tasks', task.id) && file.name === attachment.name && file.createdAt === instant(attachment.at))) throw new TypeError('Source attachment has no normalized file');
    }
    return TaskSchema.parse({ id: sourceId('tasks', task.id), workspaceId, projectId: sourceId('projects', task.project), key: task.key, title: task.title, descriptionHtml: normalizeDescription(task.desc).html, status: task.status, assigneeId: task.assignee ? sourceId('members', task.assignee) : null, priority: task.priority, startDate: task.start, dueDate: task.due, estimate: task.estimate, recurrence: task.recur?.toLowerCase() ?? null, labelIds: task.labels, dependencyIds: task.deps.map(id => sourceId('tasks', id)), position: task.order * 100, completedAt: task.status === 'done' ? instant(task.completedAt!) : null, archivedAt: null, createdAt: instant(task.created), updatedAt: instant(task.updated), version: 1, isFavorite: task.fav, subtaskSummary: { total: task.subtasks.length, completed: task.subtasks.filter(subtask => subtask.done).length }, attachmentCount: files.filter(file => file.taskId === sourceId('tasks', task.id)).length, commentCount: comments.filter(comment => comment.taskId === sourceId('tasks', task.id)).length });
  });
  const eventTypes: Record<string, string> = { moved: 'task.moved', completed: 'task.completed', 'commented on': 'comment.created', 'changed priority of': 'task.priorityChanged', 'added a file to': 'file.created', created: 'task.created', assigned: 'task.assigned', 'created project': 'project.created' };
  const activity = source.activity.map(row => {
    const task = tasks.find(task => task.id === (row.task ? sourceId('tasks', row.task) : null));
    const project = projects.find(project => project.id === (row.project ? sourceId('projects', row.project) : null));
    return ActivitySchema.parse({ id: sourceId('activity', row.id), actorId: sourceId('members', row.by), eventType: eventTypes[row.verb], taskId: task?.id ?? null, projectId: project?.id ?? null, createdAt: instant(row.at), payload: { ...(task ? { taskKey: task.key, taskTitle: task.title } : {}), ...(project ? { projectName: project.name } : {}), ...(row.extra ? { detail: row.extra } : {}), ...(row.verb === 'moved' ? { status: row.extra.slice(3).toLowerCase() } : {}), ...(row.verb === 'changed priority of' ? { priority: row.extra.slice(3).toLowerCase() } : {}) } });
  });
  const notifications = source.notifs.map(row => NotificationSchema.parse({ id: sourceId('notifs', row.id), workspaceId, recipientId: currentMemberId, actorId: row.by ? sourceId('members', row.by) : null, projectId: row.project ? sourceId('projects', row.project) : tasks.find(task => task.id === sourceId('tasks', row.task!))?.projectId ?? null, taskId: row.task ? sourceId('tasks', row.task) : null, type: row.type, text: row.text, snippet: row.snippet, createdAt: instant(row.at), readAt: row.read ? instant(row.at) : null }));
  const events = source.events.map(row => CalendarEventSchema.parse({ id: sourceId('events', row.id), workspaceId, projectId: sourceId('projects', row.project), title: row.title, date: row.date, localTime: row.time, timezone: 'UTC' }));
  const savedViews = source.savedViews.map((row, index) => SavedViewSchema.parse({ id: sourceId('savedViews', row.id), workspaceId, projectId: sourceId('projects', row.project), name: row.name, type: row.type, filters: row.filters.map(filter => ({ field: filter.f, op: filter.op, values: filter.v })), createdBy: currentMemberId, position: index * 100, version: 1 }));
  const prefs = Object.fromEntries(Object.entries(sourceFixture.prefs).filter(([key]) => key !== 'name' && key !== 'title'));
  const preferences = MemberPreferencesSchema.parse({ ...prefs, timeFmt: '12', spell: true, confirmDel: true, defaultTab: 'board', showDoneBoard: true });
  const np = source.notifPrefs as typeof source.notifPrefs & { mention_team?: boolean; mention_ws?: boolean; assign_status?: boolean; assign_over?: boolean };
  const notificationPreferences = NotificationPreferencesSchema.parse({ emailMention: np.email_mention, emailAssign: np.email_assign, emailDigest: np.email_digest, emailComment: np.email_comment, pushMention: np.push_mention, pushAssign: np.push_assign, pushComment: np.push_comment, pushDue: np.push_due, mentionAll: np.mention_all, mentionTeam: np.mention_team !== false, mentionWorkspace: !!np.mention_ws, assignSelf: np.assign_self, assignStatus: np.assign_status !== false, assignOverdue: np.assign_over !== false });
  const data: SeedDataset = { workspaceId, currentMemberId, workspaces: rowsById(workspaces), users: rowsById(users), members: rowsById(members), teams: rowsById(teams), projects: rowsById(projects), tasks: rowsById(tasks), subtasks: rowsById(subtasks), comments: rowsById(comments), files: rowsById(files), activity: rowsById(activity), notifications: rowsById(notifications), events: rowsById(events), savedViews: rowsById(savedViews), projectOrder: source.projOrder.map(id => sourceId('projects', id)), preferences, notificationPreferences };
  return data;
}
