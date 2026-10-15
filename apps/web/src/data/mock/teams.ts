import {
  CreateTeamInputSchema,
  EntityIdSchema,
  TeamSchema,
  TeamSummarySchema,
  TextQuerySchema,
  UndoResultSchema,
  UpdateTeamInputSchema,
  VersionInputSchema,
} from '@studio/contracts/api';
import type { OperationId, TeamDto, TeamMutationDto } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { StudioApiError } from '../errors.ts';
import { transactMock } from './transaction.ts';
import { newMockId } from './task-fields.ts';
import { readDashboardScope } from './dashboards.ts';
import { projectCatalogItem } from './reads.ts';

export const teamOperations = [
  'listTeams',
  'getTeam',
  'getTeamSummary',
  'createTeam',
  'updateTeam',
  'deleteTeam',
] as const satisfies readonly OperationId[];
function fail(
  code:
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'CONFLICT'
    | 'VALIDATION_ERROR'
    | 'PAYLOAD_TOO_LARGE'
    | 'INTERNAL_ERROR',
  message: string,
  field?: string,
): never {
  throw new StudioApiError({
    error: { code, message, ...(field ? { fieldErrors: { [field]: [message] } } : {}) },
  });
}
function actor(data: MockDataset, write = false) {
  const member = data.members[data.currentMemberId];
  if (!member || member.workspaceId !== data.workspaceId || member.status !== 'active')
    return fail('NOT_FOUND', 'Workspace membership is unavailable');
  if (write && !['Owner', 'Admin'].includes(member.role))
    return fail('FORBIDDEN', 'Only workspace administrators can manage teams');
}
function teamOf(data: MockDataset, id: unknown, deleted = false): TeamDto {
  const team = data.teams[EntityIdSchema.parse(id)];
  if (
    !team ||
    team.workspaceId !== data.workspaceId ||
    (!deleted && data.teamCommands.deletedTeams[team.id])
  )
    return fail('NOT_FOUND', 'Team not found');
  return team;
}
const normalized = (name: string) => name.trim().toLowerCase();
function uniqueName(data: MockDataset, name: string, except?: string) {
  if (
    Object.values(data.teams).some(
      (team) =>
        team.id !== except &&
        team.workspaceId === data.workspaceId &&
        !data.teamCommands.deletedTeams[team.id] &&
        normalized(team.name) === normalized(name),
    )
  )
    return fail('CONFLICT', `A team called “${name}” already exists`, 'name');
}
function membersOf(data: MockDataset, ids: readonly string[]) {
  for (const id of ids) {
    const member = data.members[EntityIdSchema.parse(id)];
    if (!member || member.workspaceId !== data.workspaceId)
      return fail('VALIDATION_ERROR', 'Choose workspace members', 'memberIds');
  }
}
function assignments(
  data: MockDataset,
  teamId: TeamDto['id'],
  selected: readonly string[],
  clock: Clock,
) {
  const changed = Object.values(data.members).filter(
    (member) =>
      member.workspaceId === data.workspaceId &&
      (selected.includes(member.id) ? member.teamId !== teamId : member.teamId === teamId),
  );
  const otherTeams = new Set(
    changed.flatMap((member) => (member.teamId && member.teamId !== teamId ? [member.teamId] : [])),
  );
  for (const member of changed)
    data.members[member.id] = {
      ...member,
      teamId: selected.includes(member.id) ? teamId : null,
      version: member.version + 1,
    };
  for (const id of otherTeams) {
    const team = teamOf(data, id);
    data.teams[id] = {
      ...team,
      memberIds: Object.values(data.members)
        .filter((member) => member.teamId === id)
        .map((member) => member.id),
      version: team.version + 1,
      updatedAt: clock.now(),
    };
  }
  return changed.map((member) => data.members[member.id]!);
}
function mutation(
  team: TeamDto,
  members: TeamMutationDto['members'] = [],
  affectedProjectIds: TeamMutationDto['affectedProjectIds'] = [],
): TeamMutationDto {
  return { team, members, affectedProjectIds, undo: null };
}

async function execute(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
) {
  const read = ['listTeams', 'getTeam', 'getTeamSummary'].includes(id);
  actor(data, !read);
  if (input.workspaceId && input.workspaceId !== data.workspaceId)
    return fail('NOT_FOUND', 'Workspace data is not available');
  switch (id) {
    case 'listTeams': {
      const { q } = TextQuerySchema.parse(input.query);
      return {
        data: Object.values(data.teams).filter(
          (team) =>
            team.workspaceId === data.workspaceId &&
            !data.teamCommands.deletedTeams[team.id] &&
            (!q || `${team.name} ${team.description}`.toLowerCase().includes(q.toLowerCase())),
        ),
      };
    }
    case 'getTeam':
      return { data: teamOf(data, input.teamId) };
    case 'getTeamSummary': {
      const team = teamOf(data, input.teamId),
        scope = readDashboardScope(data),
        tasks = scope.tasks.filter(
          (task) => task.assigneeId && team.memberIds.includes(task.assigneeId),
        );
      return {
        data: TeamSummarySchema.parse({
          teamId: team.id,
          open: tasks.filter((task) => task.status !== 'done').length,
          completed: tasks.filter((task) => task.status === 'done').length,
          projects: scope.projects
            .filter((project) => project.teamId === team.id)
            .map((project) => projectCatalogItem(data, project, clock)),
          workload: team.memberIds.map((memberId) => ({
            memberId,
            open: tasks.filter((task) => task.assigneeId === memberId && task.status !== 'done')
              .length,
          })),
        }),
      };
    }
    case 'createTeam': {
      const body = CreateTeamInputSchema.parse(input.body);
      uniqueName(data, body.name);
      membersOf(data, body.memberIds);
      const team = TeamSchema.parse({
        ...body,
        description: body.description.trim() || 'No description yet.',
        id: newMockId(clock),
        workspaceId: data.workspaceId,
        version: 1,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });
      data.teams[team.id] = team;
      const changed = assignments(data, team.id, body.memberIds, clock);
      return { data: mutation(team, changed) };
    }
    case 'updateTeam': {
      const { expectedVersion, ...patch } = UpdateTeamInputSchema.parse(input.body),
        team = teamOf(data, input.teamId);
      if (team.version !== expectedVersion)
        return fail('CONFLICT', 'This team changed. Refresh and try again.');
      const next = TeamSchema.parse({
        ...team,
        ...patch,
        version: team.version + 1,
        updatedAt: clock.now(),
      });
      uniqueName(data, next.name, team.id);
      membersOf(data, next.memberIds);
      const changed = assignments(data, team.id, next.memberIds, clock);
      data.teams[next.id] = next;
      return { data: mutation(next, changed) };
    }
    case 'deleteTeam': {
      const { expectedVersion } = VersionInputSchema.parse(input.body),
        team = teamOf(data, input.teamId);
      if (team.version !== expectedVersion)
        return fail('CONFLICT', 'This team changed. Refresh and try again.');
      // The queue reads the exact set inside the same staged command as all writes,
      // including archived, deleted and private project associations.
      const members = Object.values(data.members).filter(
          (member) => member.workspaceId === data.workspaceId && member.teamId === team.id,
        ),
        projects = Object.values(data.projects).filter(
          (project) => project.workspaceId === data.workspaceId && project.teamId === team.id,
        ),
        undoId = newMockId(clock),
        record: MockDataset['teamCommands']['undoRecords'][TeamDto['id']] = {
          actorId: data.currentMemberId,
          teamId: team.id,
          postVersion: team.version + 1,
          nameNormalized: normalized(team.name),
          deletedAt: clock.now(),
          members: members.map((member) => ({
            id: member.id,
            postVersion: member.version + 1,
            status: member.status,
          })),
          projects: projects.map((project) => ({
            id: project.id,
            postVersion: project.version + 1,
            archivedAt: project.archivedAt,
            deletedAt: data.projectCommands.deletedProjects[project.id] ?? null,
          })),
          result: null,
        };
      if (
        1 + members.length + projects.length > 128 ||
        new TextEncoder().encode(JSON.stringify(record)).byteLength > 65536
      )
        return fail('PAYLOAD_TOO_LARGE', 'This team exceeds the bounded Undo limits');
      for (const member of members)
        data.members[member.id] = { ...member, teamId: null, version: member.version + 1 };
      for (const project of projects)
        data.projects[project.id] = {
          ...project,
          teamId: null,
          version: project.version + 1,
          updatedAt: clock.now(),
        };
      const next = { ...team, memberIds: [], version: record.postVersion, updatedAt: clock.now() };
      data.teams[team.id] = next;
      data.teamCommands.deletedTeams[team.id] = record.deletedAt;
      data.teamCommands.deletedBy[team.id] = data.currentMemberId;
      data.teamCommands.undoRecords[undoId] = record;
      return {
        data: {
          ...mutation(
            next,
            members.map((member) => data.members[member.id]!),
            projects.map((project) => project.id),
          ),
          undo: { id: undoId, kind: 'team.delete' as const },
        },
      };
    }
    case 'undoCommand': {
      const undoId = EntityIdSchema.parse(input.undoId),
        record = data.teamCommands.undoRecords[undoId];
      if (!record || record.actorId !== data.currentMemberId)
        return fail('NOT_FOUND', 'Undo not found');
      const team = teamOf(data, record.teamId, true);
      if (record.result) return { data: record.result };
      if (
        team.version !== record.postVersion ||
        data.teamCommands.deletedTeams[team.id] !== record.deletedAt ||
        data.teamCommands.deletedBy[team.id] !== data.currentMemberId ||
        normalized(team.name) !== record.nameNormalized
      )
        return fail('CONFLICT', 'The team changed. Undo cannot be applied.');
      uniqueName(data, team.name, team.id);
      for (const target of record.members) {
        const member = data.members[target.id];
        if (
          !member ||
          member.workspaceId !== data.workspaceId ||
          member.version !== target.postVersion ||
          member.teamId !== null ||
          member.status !== target.status
        )
          return fail('CONFLICT', 'A team member changed. Undo cannot be applied.');
      }
      for (const target of record.projects) {
        const project = data.projects[target.id];
        if (
          !project ||
          project.workspaceId !== data.workspaceId ||
          project.version !== target.postVersion ||
          project.teamId !== null ||
          project.archivedAt !== target.archivedAt ||
          (data.projectCommands.deletedProjects[project.id] ?? null) !== target.deletedAt
        )
          return fail('CONFLICT', 'A team project changed. Undo cannot be applied.');
      }
      delete data.teamCommands.deletedTeams[team.id];
      delete data.teamCommands.deletedBy[team.id];
      data.teams[team.id] = {
        ...team,
        memberIds: record.members.map((target) => target.id),
        version: team.version + 1,
        updatedAt: clock.now(),
      };
      for (const target of record.members) {
        const member = data.members[target.id]!;
        data.members[target.id] = { ...member, teamId: team.id, version: member.version + 1 };
      }
      for (const target of record.projects) {
        const project = data.projects[target.id]!;
        data.projects[target.id] = {
          ...project,
          teamId: team.id,
          version: project.version + 1,
          updatedAt: clock.now(),
        };
      }
      record.result = UndoResultSchema.parse({
        undoId,
        kind: 'team.delete',
        appliedAt: clock.now(),
        affected: {
          teamIds: [team.id],
          memberIds: record.members.map((target) => target.id),
          projectIds: record.projects.map((target) => target.id),
          taskIds: [],
          commentIds: [],
          fileIds: [],
        },
      });
      return { data: record.result };
    }
    default:
      throw new TypeError('Unsupported team operation');
  }
}
export function runTeamOperation(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
  persist?: (staged: MockDataset) => boolean,
) {
  return ['listTeams', 'getTeam', 'getTeamSummary'].includes(id)
    ? execute(id, input, data, clock)
    : transactMock(data, async (staged) => {
        const result = await execute(id, input, staged, clock);
        if (persist && !persist(staged))
          return fail('INTERNAL_ERROR', 'Team changes could not be saved. Please try again.');
        return result;
      });
}
export function hasTeamUndo(data: MockDataset, id: unknown) {
  const parsed = EntityIdSchema.safeParse(id);
  return parsed.success && !!data.teamCommands.undoRecords[parsed.data];
}
