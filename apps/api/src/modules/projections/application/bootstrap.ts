import type { BootstrapDto, MemberDto, TaskSummaryDto } from '@studio/contracts/api';
import {
  BootstrapSchema,
  catalogs,
  DateOnlySchema,
  EntityIdSchema,
  MemberPreferencesSchema,
  NotificationPreferencesSchema,
} from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import { projectProjection, restrictedProjectProjection } from '../../projects/projections.ts';
import { teamDto } from '../../teams/projections.ts';
import { workspaceDto } from '../../workspaces/projections.ts';
import type { AggregateRow } from '../persistence/bootstrap-model.ts';
import {
  readBootstrapRead,
  readBootstrapReadResult,
  readBootstrapReadSubtasks,
  readBootstrapReadTasks,
} from '../persistence/bootstrap.ts';

function summary(row: AggregateRow | undefined): TaskSummaryDto {
  const byStatus = {
      backlog: row?.backlog ?? 0,
      todo: row?.todo ?? 0,
      progress: row?.progress ?? 0,
      review: row?.review ?? 0,
      done: row?.done ?? 0,
    },
    byPriority = {
      urgent: row?.urgent ?? 0,
      high: row?.high ?? 0,
      medium: row?.medium ?? 0,
      low: row?.low ?? 0,
      none: row?.none ?? 0,
    },
    total = row?.total ?? 0;
  return {
    total,
    byStatus,
    byPriority,
    completed: byStatus.done,
    completionRate: total ? Math.round((byStatus.done / total) * 100) : 0,
    overdue: row?.overdue ?? 0,
    subtaskTotals: { total: row?.subtaskTotal ?? 0, completed: row?.subtaskDone ?? 0 },
  };
}
export async function readBootstrap(
  repository: RequestRepository,
  scope: WorkspaceContext,
  currentMember: MemberDto,
  now: number,
): Promise<BootstrapDto> {
  const [workspaceRows, members, teamRows, projectRows, grants, milestones, favorites, prefs] =
    await readBootstrapRead(repository, scope);
  const workspace = workspaceDto(required(workspaceRows[0], 'Missing projections state'));
  // Date-only derives from server clock in workspace timezone; never browser/query time.
  const today = DateOnlySchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: workspace.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now)),
  );
  const aggregate = await readBootstrapReadSubtasks(repository, scope, today);
  const [counts] = await readBootstrapReadTasks(repository, scope, today);
  const [notifications] = await readBootstrapReadResult(repository, scope);
  const catalogProjects = projectRows.map(({ project: p }) => {
    const granted = grants.some(
      (g) => g.projectMembers.projectId === p.id && g.projectMembers.memberId === scope.memberId,
    );
    const lead = members.find((m) => m.id === p.leadId);
    if (!lead) throw new ApiFailure('INTERNAL_ERROR', 'Missing Bootstrap project lead');
    if (p.visibility === 'private' && !granted)
      return {
        access: 'restricted' as const,
        project: restrictedProjectProjection(p, lead),
      };
    const taskSummary = summary(aggregate.find((a) => a.projectId === p.id));
    return {
      access: 'allowed' as const,
      project: projectProjection(p, {
        memberIds: grants
          .filter((g) => g.projectMembers.projectId === p.id)
          .map((g) => g.projectMembers.memberId),
        milestones: milestones
          .filter((m) => m.milestone.projectId === p.id)
          .map((m) => m.milestone),
        isFavorite: favorites.some((f) => f.projectId === p.id),
      }),
      summary: {
        projectId: EntityIdSchema.parse(p.id),
        taskSummary,
        progress: taskSummary.completionRate,
      },
    };
  });
  return BootstrapSchema.parse({
    workspace,
    currentMember,
    members: members.map(({ id, name, avatarColor }) => ({ id, name, avatarColor })),
    teams: teamRows.map((t) => teamDto(t, members)),
    projects: catalogProjects,
    catalogs,
    preferences: MemberPreferencesSchema.parse(prefs[0]?.preferencesJson),
    notificationPreferences: NotificationPreferencesSchema.parse(
      prefs[0]?.notificationPreferencesJson,
    ),
    unreadCount: notifications?.unread ?? 0,
    navigationCounts: {
      inbox: notifications?.inbox ?? 0,
      myTasks: counts?.myTasks ?? 0,
      archive: counts?.archive ?? 0,
    },
  });
}
