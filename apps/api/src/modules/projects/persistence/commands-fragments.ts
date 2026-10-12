import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';

import type { EntityId } from '@studio/contracts/api';
import type { WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import type { TaskRow } from '../../tasks/projections.ts';
import type { ProjectRow } from '../projections.ts';

export const referenceGuard = (
  s: WorkspaceContext,
  leadId: string,
  teamId: string | null,
): SqlPredicate => ({
  sql: `EXISTS (SELECT 1 FROM workspaceMembers WHERE workspaceId=? AND id=? AND status='active' AND removedAt IS NULL) AND (? IS NULL OR EXISTS (SELECT 1 FROM teams WHERE workspaceId=? AND id=? AND deletedAt IS NULL))`,
  parameters: [s.workspaceId, leadId, teamId, s.workspaceId, teamId],
});
export function history(
  s: WorkspaceContext,
  p: ProjectRow,
  marker: EntityId,
  now: number,
  eventType: string,
  task?: TaskRow,
  generateId: IdGenerator = newId,
) {
  return {
    id: generateId(),
    workspaceId: s.workspaceId,
    projectId: p.id,
    taskId: task?.id ?? null,
    actorId: s.memberId,
    eventType,
    payloadJson: JSON.stringify(
      task
        ? { taskKey: `${p.key}-${task.number}`, taskTitle: task.title, projectName: p.name }
        : { projectName: p.name },
    ),
    commandId: marker,
    revertedAt: null,
    createdAt: now,
  };
}
