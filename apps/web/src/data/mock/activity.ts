import { ActivityQuerySchema, MemberQuerySchema } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { canReadMockProject as canReadProject } from './project-access.ts';
import type { MockDataset } from './dataset.ts';
import { fail } from './primitives.ts';
import { cursorPage } from './cursor-page.ts';
import { getTask } from './task-aggregate.ts';

export async function executeActivity(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
): Promise<unknown> {
  switch (id) {
    case 'listMembers': {
      const actor = data.members[data.currentMemberId];
      if (!actor || actor.status !== 'active' || actor.workspaceId !== data.workspaceId)
        return fail('NOT_FOUND', 'Workspace data is not available');
      const query = MemberQuerySchema.parse(input.query),
        { cursor, limit, ...scope } = query;
      const rows = Object.values(data.members)
        .filter(
          (row) =>
            row.workspaceId === data.workspaceId &&
            (!query.q ||
              row.name.toLowerCase().includes(query.q.toLowerCase()) ||
              row.email.toLowerCase().includes(query.q.toLowerCase())) &&
            (!query.teamId || row.teamId === query.teamId) &&
            (!query.status || row.status === query.status),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      return {
        data: await cursorPage(
          rows,
          { cursor, limit },
          { ...scope, operation: id, workspaceId: data.workspaceId, actorId: data.currentMemberId },
          false,
        ),
      };
    }
    case 'listActivity': {
      const actor = data.members[data.currentMemberId];
      if (!actor || actor.status !== 'active' || actor.workspaceId !== data.workspaceId)
        return fail('NOT_FOUND', 'Workspace data is not available');
      const query = ActivityQuerySchema.parse(input.query),
        { cursor, limit, ...scope } = query;
      if (query.actorId && data.members[query.actorId]?.workspaceId !== data.workspaceId)
        return fail('NOT_FOUND', 'Member not found');
      if (query.taskId) getTask(data, query.taskId);
      if (query.projectId && !canReadProject(data.projects[query.projectId], data))
        return fail('NOT_FOUND', 'Project not found');
      const rows = Object.values(data.activity)
        .filter((row) => {
          const task = row.taskId ? data.tasks[row.taskId] : null,
            parentId = task?.projectId ?? row.projectId;
          if (row.actorId && data.members[row.actorId]?.workspaceId !== data.workspaceId)
            return false;
          if (task && row.projectId && row.projectId !== task.projectId) return false;
          if (
            row.taskId &&
            (!task ||
              task.workspaceId !== data.workspaceId ||
              data.taskCommands.deletedTasks[row.taskId])
          )
            return false;
          if (
            row.projectId &&
            (!canReadProject(data.projects[row.projectId], data) ||
              data.projects[row.projectId]!.archivedAt)
          )
            return false;
          if (
            parentId &&
            (!canReadProject(data.projects[parentId], data) || data.projects[parentId]!.archivedAt)
          )
            return false;
          return (
            (!query.projectId || parentId === query.projectId) &&
            (!query.taskId || row.taskId === query.taskId) &&
            (!query.actorId || row.actorId === query.actorId)
          );
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return {
        data: await cursorPage(
          rows,
          { cursor, limit },
          { ...scope, operation: id, workspaceId: data.workspaceId, actorId: data.currentMemberId },
          true,
        ),
      };
    }
    default:
      throw new TypeError('Unsupported activity operation');
  }
}
