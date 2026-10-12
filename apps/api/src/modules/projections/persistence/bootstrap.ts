import type { DateOnly } from '@studio/contracts/api';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import {
  memberPreferences,
  memberProjectOrder,
  projectFavorites,
  projectMembers,
  projectMilestones,
  projects,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '../../../db/schema.ts';
import { notificationFrom, notificationVisible } from '../../notifications/visibility.ts';
import { readAccessSql as accessSql, readAccessExpression } from '../../projects/access.ts';
import type { AggregateRow } from './bootstrap-model.ts';
export function readBootstrapRead(repository: RequestRepository, scope: WorkspaceContext) {
  return repository.read((db) =>
    db.batch([
      db.select().from(workspaces).where(eq(workspaces.id, scope.workspaceId)),
      db
        .select({
          id: workspaceMembers.id,
          name: users.name,
          avatarColor: users.avatarColor,
          teamId: workspaceMembers.teamId,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, scope.workspaceId),
            isNull(workspaceMembers.removedAt),
          ),
        )
        .orderBy(asc(workspaceMembers.id)),
      db
        .select()
        .from(teams)
        .where(and(eq(teams.workspaceId, scope.workspaceId), isNull(teams.deletedAt)))
        .orderBy(asc(teams.id)),
      db
        .select({ project: projects, position: memberProjectOrder.position })
        .from(projects)
        .leftJoin(
          memberProjectOrder,
          and(
            eq(memberProjectOrder.workspaceId, scope.workspaceId),
            eq(memberProjectOrder.memberId, scope.memberId),
            eq(memberProjectOrder.projectId, projects.id),
          ),
        )
        .where(
          and(
            eq(projects.workspaceId, scope.workspaceId),
            isNull(projects.deletedAt),
            isNull(projects.archivedAt),
          ),
        )
        .orderBy(sql`coalesce(${memberProjectOrder.position}, 2147483647)`, asc(projects.id)),
      db
        .select()
        .from(projectMembers)
        .innerJoin(
          projects,
          and(
            eq(projectMembers.projectId, projects.id),
            eq(projectMembers.workspaceId, projects.workspaceId),
          ),
        )
        .where(
          and(
            eq(projectMembers.workspaceId, scope.workspaceId),
            readAccessExpression(projects, scope.memberId),
          ),
        ),
      db
        .select({ milestone: projectMilestones })
        .from(projectMilestones)
        .innerJoin(
          projects,
          and(
            eq(projectMilestones.projectId, projects.id),
            eq(projectMilestones.workspaceId, projects.workspaceId),
          ),
        )
        .where(
          and(
            eq(projectMilestones.workspaceId, scope.workspaceId),
            readAccessExpression(projects, scope.memberId),
          ),
        )
        .orderBy(asc(projectMilestones.position)),
      db
        .select()
        .from(projectFavorites)
        .where(
          and(
            eq(projectFavorites.workspaceId, scope.workspaceId),
            eq(projectFavorites.memberId, scope.memberId),
          ),
        ),
      db
        .select()
        .from(memberPreferences)
        .where(
          and(
            eq(memberPreferences.workspaceId, scope.workspaceId),
            eq(memberPreferences.memberId, scope.memberId),
          ),
        ),
    ]),
  );
}
export function readBootstrapReadSubtasks(
  repository: RequestRepository,
  scope: WorkspaceContext,
  today: DateOnly,
) {
  return repository.all<AggregateRow>(
    `WITH childCounts AS (SELECT workspaceId,taskId,count(*) total,sum(done) completed FROM subtasks WHERE workspaceId=? GROUP BY workspaceId,taskId) SELECT t.projectId,count(*) total,${['backlog', 'todo', 'progress', 'review', 'done'].map((s) => `sum(t.status='${s}') ${s}`).join(',')},${['urgent', 'high', 'medium', 'low', 'none'].map((s) => `sum(t.priority='${s}') ${s}`).join(',')},sum(t.status!='done' AND t.dueDate IS NOT NULL AND t.dueDate<?) overdue,coalesce(sum(c.total),0) subtaskTotal,coalesce(sum(c.completed),0) subtaskDone FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId LEFT JOIN childCounts c ON c.workspaceId=t.workspaceId AND c.taskId=t.id WHERE t.workspaceId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} GROUP BY t.projectId`,
    [scope.workspaceId, today, scope.workspaceId, scope.memberId],
  );
}
export function readBootstrapReadTasks(
  repository: RequestRepository,
  scope: WorkspaceContext,
  today: DateOnly,
) {
  return repository.all<{ myTasks: number; archive: number }>(
    `SELECT (SELECT count(*) FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.assigneeId=? AND t.status!='done' AND t.dueDate<=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}) myTasks,((SELECT count(*) FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.archivedAt IS NOT NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql})+(SELECT count(*) FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql})) archive`,
    [
      scope.workspaceId,
      scope.memberId,
      today,
      scope.memberId,
      scope.workspaceId,
      scope.memberId,
      scope.workspaceId,
      scope.memberId,
    ],
  );
}
export function readBootstrapReadResult(repository: RequestRepository, scope: WorkspaceContext) {
  return repository.all<{ unread: number; inbox: number }>(
    `SELECT count(*) unread,coalesce(sum(n.type!='update'),0) inbox FROM ${notificationFrom} WHERE ${notificationVisible} AND n.readAt IS NULL`,
    [scope.workspaceId, scope.memberId, scope.memberId],
  );
}
