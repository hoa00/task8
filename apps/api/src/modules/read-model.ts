import type { EntityId, MemberDto, ProjectListItemDto } from '@studio/contracts/api';
import {
  ProjectSchema,
  ProjectSummarySchema,
  RestrictedProjectSchema,
  TaskSchema,
  TeamSchema,
  VisibilitySchema,
} from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/client.ts';
import type { projects, subtasks, tasks, teams } from '../db/schema.ts';
import { instant, nullableInstant } from '../shared/clock.ts';
import { ApiFailure } from '../shared/errors.ts';
import { members } from './members/index.ts';
import type { ProjectLifecycle } from './projects/index.ts';
import {
  readAccessSql as accessSql,
  canAccessProject,
  grantProjection,
  projectLifecycleSql,
  writeAccessSql,
} from './projects/index.ts';
import { today } from './workspaces/index.ts';
export type ProjectRow = typeof projects.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type SubtaskRow = typeof subtasks.$inferSelect;
export async function projectRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  mode: {
    visibility: 'detail' | 'child';
    lifecycle: ProjectLifecycle;
    access: 'read' | 'write';
  } = { visibility: 'detail', lifecycle: 'detail', access: 'read' },
) {
  const [row] = await r.all<ProjectRow & { allowed: number }>(
    `SELECT p.*,${mode.access === 'write' ? writeAccessSql : accessSql} allowed FROM projects p WHERE p.workspaceId=? AND p.id=?${projectLifecycleSql(mode.lifecycle)}`,
    [s.memberId, s.workspaceId, id],
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Project not found');
  if (!row.allowed)
    throw new ApiFailure(
      mode.visibility === 'child' ? 'NOT_FOUND' : 'FORBIDDEN',
      'Project is restricted',
    );
  return row;
}
export async function teamRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  deleted = false,
) {
  const [row] = await r.all<TeamRow>(
    `SELECT * FROM teams WHERE workspaceId=? AND id=?${deleted ? '' : ' AND deletedAt IS NULL'}`,
    [s.workspaceId, id],
  );
  if (!row) throw new ApiFailure('NOT_FOUND', 'Team not found');
  return row;
}
export function teamDto(t: TeamRow, memberRows: MemberDto[]) {
  return TeamSchema.parse({
    id: t.id,
    workspaceId: t.workspaceId,
    name: t.name,
    description: t.description,
    icon: t.icon,
    color: t.color,
    memberIds: memberRows.filter((m) => m.teamId === t.id).map((m) => m.id),
    createdAt: instant(t.createdAt),
    updatedAt: instant(t.updatedAt),
    version: t.version,
  });
}
export async function activeTasks(r: RequestRepository, s: WorkspaceContext) {
  return r.all<TaskRow>(
    `SELECT t.* FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} ORDER BY t.position,t.id`,
    [s.workspaceId, s.memberId],
  );
}
export async function projectCatalog(
  r: RequestRepository,
  s: WorkspaceContext,
  now: number,
  includeDeleted = false,
): Promise<ProjectListItemDto[]> {
  const rows = await r.all<ProjectRow>(
    'SELECT * FROM projects WHERE workspaceId=?' +
      (includeDeleted ? '' : ' AND deletedAt IS NULL') +
      ' ORDER BY id',
    [s.workspaceId],
  );
  const grants = await r.all<{ projectId: string; memberId: string; permission: string }>(
    'SELECT * FROM projectMembers WHERE workspaceId=?',
    [s.workspaceId],
  );
  const memberRows = await members(r, s);
  const milestones = await r.all<{
    id: string;
    workspaceId: string;
    projectId: string;
    name: string;
    date: string;
    position: number;
  }>(
    `SELECT m.* FROM projectMilestones m JOIN projects p ON p.workspaceId=m.workspaceId AND p.id=m.projectId WHERE m.workspaceId=? AND p.deletedAt IS NULL AND ${accessSql} ORDER BY m.position,m.id`,
    [s.workspaceId, s.memberId],
  );
  const favorites = await r.all<{ projectId: string }>(
    'SELECT projectId FROM projectFavorites WHERE workspaceId=? AND memberId=?',
    [s.workspaceId, s.memberId],
  );
  const taskRows = await activeTasks(r, s),
    date = await today(r, s, now);
  const children = await r.all<{ taskId: string; total: number; completed: number }>(
    `SELECT c.taskId,count(*) total,sum(c.done) completed FROM subtasks c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE c.workspaceId=? AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND t.deletedAt IS NULL AND t.archivedAt IS NULL AND ${accessSql} GROUP BY c.taskId`,
    [s.workspaceId, s.memberId],
  );
  return rows.map((p) => {
    if (
      !canAccessProject(
        {
          visibility: VisibilitySchema.parse(p.visibility),
          memberId: s.memberId,
          grants: grants.filter((g) => g.projectId === p.id).map(grantProjection),
        },
        'read',
      )
    ) {
      const lead = memberRows.find((m) => m.id === p.leadId)!;
      return {
        access: 'restricted',
        project: RestrictedProjectSchema.parse({
          id: p.id,
          workspaceId: p.workspaceId,
          name: p.name,
          key: p.key,
          icon: p.icon,
          color: p.color,
          status: p.status,
          dueDate: p.dueDate,
          lead: { id: lead.id, name: lead.name, avatarColor: lead.avatarColor },
          catalogSummary: p.description,
        }),
      };
    }
    const ts = taskRows.filter((t) => t.projectId === p.id),
      total = ts.length;
    const byStatus = { backlog: 0, todo: 0, progress: 0, review: 0, done: 0 },
      byPriority = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
    for (const t of ts) {
      byStatus[t.status as keyof typeof byStatus]++;
      byPriority[t.priority as keyof typeof byPriority]++;
    }
    const subtaskTotals = children
      .filter((c) => ts.some((t) => t.id === c.taskId))
      .reduce(
        (sum, c) => ({ total: sum.total + c.total, completed: sum.completed + c.completed }),
        { total: 0, completed: 0 },
      );
    const taskSummary = {
      total,
      byStatus,
      byPriority,
      completed: byStatus.done,
      completionRate: total ? Math.round((byStatus.done / total) * 100) : 0,
      overdue: ts.filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate < date)
        .length,
      subtaskTotals,
    };
    return {
      access: 'allowed',
      project: ProjectSchema.parse({
        id: p.id,
        workspaceId: p.workspaceId,
        key: p.key,
        name: p.name,
        description: p.description,
        icon: p.icon,
        color: p.color,
        status: p.status,
        teamId: p.teamId,
        leadId: p.leadId,
        startDate: p.startDate,
        dueDate: p.dueDate,
        visibility: p.visibility,
        memberIds: grants.filter((g) => g.projectId === p.id).map((g) => g.memberId),
        milestones: milestones.filter((m) => m.projectId === p.id),
        isFavorite: favorites.some((f) => f.projectId === p.id),
        archivedAt: nullableInstant(p.archivedAt),
        createdAt: instant(p.createdAt),
        updatedAt: instant(p.updatedAt),
        lastActivityAt: instant(p.lastActivityAt),
        version: p.version,
      }),
      summary: ProjectSummarySchema.parse({
        projectId: p.id,
        taskSummary,
        progress: taskSummary.completionRate,
      }),
    };
  });
}
export async function projectDto(
  r: RequestRepository,
  s: WorkspaceContext,
  p: ProjectRow,
  now: number,
) {
  // A deleted root is returned only by its own command/restore response, with no private child leak.
  const grants = await r.all<{ memberId: string }>(
    'SELECT memberId FROM projectMembers WHERE workspaceId=? AND projectId=? ORDER BY memberId',
    [s.workspaceId, p.id],
  );
  const milestones = await r.all(
    'SELECT * FROM projectMilestones WHERE workspaceId=? AND projectId=? ORDER BY position,id',
    [s.workspaceId, p.id],
  );
  const fav = await r.all(
    'SELECT 1 FROM projectFavorites WHERE workspaceId=? AND memberId=? AND projectId=?',
    [s.workspaceId, s.memberId, p.id],
  );
  void now;
  return ProjectSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    key: p.key,
    name: p.name,
    description: p.description,
    icon: p.icon,
    color: p.color,
    status: p.status,
    teamId: p.teamId,
    leadId: p.leadId,
    startDate: p.startDate,
    dueDate: p.dueDate,
    visibility: p.visibility,
    memberIds: grants.map((g) => g.memberId),
    milestones,
    isFavorite: !!fav.length,
    archivedAt: nullableInstant(p.archivedAt),
    createdAt: instant(p.createdAt),
    updatedAt: instant(p.updatedAt),
    lastActivityAt: instant(p.lastActivityAt),
    version: p.version,
  });
}
export async function createdTaskDtos(r: RequestRepository, s: WorkspaceContext, p: ProjectRow) {
  const ts = await r.all<TaskRow>(
    'SELECT * FROM tasks WHERE workspaceId=? AND projectId=? ORDER BY position,id',
    [s.workspaceId, p.id],
  );
  const labels = await r.all<{ taskId: string; labelId: string }>(
    'SELECT l.* FROM taskLabels l JOIN tasks t ON t.workspaceId=l.workspaceId AND t.id=l.taskId WHERE t.workspaceId=? AND t.projectId=?',
    [s.workspaceId, p.id],
  );
  const deps = await r.all<{ taskId: string; dependsOnTaskId: string }>(
    'SELECT d.* FROM taskDependencies d JOIN tasks t ON t.workspaceId=d.workspaceId AND t.id=d.taskId WHERE t.workspaceId=? AND t.projectId=?',
    [s.workspaceId, p.id],
  );
  const children = await r.all<{ taskId: string; done: number }>(
    'SELECT c.taskId,c.done FROM subtasks c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId WHERE t.workspaceId=? AND t.projectId=?',
    [s.workspaceId, p.id],
  );
  return ts.map((t) =>
    TaskSchema.parse({
      id: t.id,
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      key: `${p.key}-${t.number}`,
      title: t.title,
      descriptionHtml: t.descriptionHtml,
      status: t.status,
      assigneeId: t.assigneeId,
      priority: t.priority,
      startDate: t.startDate,
      dueDate: t.dueDate,
      estimate: t.estimate,
      recurrence: t.recurrence,
      labelIds: labels.filter((l) => l.taskId === t.id).map((l) => l.labelId),
      dependencyIds: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
      position: t.position,
      completedAt: nullableInstant(t.completedAt),
      archivedAt: nullableInstant(t.archivedAt),
      createdAt: instant(t.createdAt),
      updatedAt: instant(t.updatedAt),
      version: t.version,
      isFavorite: false,
      subtaskSummary: {
        total: children.filter((c) => c.taskId === t.id).length,
        completed: children.filter((c) => c.taskId === t.id && c.done).length,
      },
      attachmentCount: 0,
      commentCount: 0,
    }),
  );
}
export { member, members } from './members/index.ts';
export { today } from './workspaces/index.ts';
