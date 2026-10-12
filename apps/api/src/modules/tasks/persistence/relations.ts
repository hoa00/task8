import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { writeAccessSql } from '../../projects/index.ts';
export interface TaskRelations {
  id: string;
  projectId: string;
  assigneeId: string | null;
  dependencyIds: string[];
  subtaskAssigneeIds: (string | null)[];
}
export function relationGuard(s: WorkspaceContext, rows: TaskRelations[]): SqlPredicate {
  const json = JSON.stringify(rows);
  return {
    sql: `NOT EXISTS (SELECT 1 FROM json_each(?) intent WHERE
    NOT EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=json_extract(intent.value,'$.projectId') AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) OR
    (json_extract(intent.value,'$.assigneeId') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=? AND m.id=json_extract(intent.value,'$.assigneeId') AND m.removedAt IS NULL)) OR
    EXISTS (SELECT 1 FROM json_each(intent.value,'$.subtaskAssigneeIds') child WHERE child.value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=? AND m.id=child.value AND m.removedAt IS NULL)) OR
    EXISTS (SELECT 1 FROM json_each(intent.value,'$.dependencyIds') dependency WHERE dependency.value=json_extract(intent.value,'$.id') OR NOT EXISTS (SELECT 1 FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.id=dependency.value AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?))))
  ) AND NOT EXISTS (WITH RECURSIVE intents AS (SELECT value FROM json_each(?)), edges(a,b) AS (
    SELECT taskId,dependsOnTaskId FROM taskDependencies WHERE workspaceId=? AND taskId NOT IN (SELECT json_extract(value,'$.id') FROM intents)
    UNION SELECT json_extract(intents.value,'$.id'),edge.value FROM intents,json_each(intents.value,'$.dependencyIds') edge
  ), reach(a,b) AS (SELECT a,b FROM edges UNION SELECT reach.a,edges.b FROM reach JOIN edges ON edges.a=reach.b)
  SELECT 1 FROM reach WHERE a=b)`,
    parameters: [
      json,
      s.workspaceId,
      s.memberId,
      s.workspaceId,
      s.workspaceId,
      s.workspaceId,
      s.memberId,
      json,
      s.workspaceId,
    ],
  };
}
export async function validateRelations(
  r: RequestRepository,
  s: WorkspaceContext,
  rows: TaskRelations[],
) {
  if (rows.some((t) => t.dependencyIds.includes(t.id)))
    throw new ApiFailure('VALIDATION_ERROR', 'A task cannot depend on itself');
  const guard = relationGuard(s, rows),
    split = guard.sql.indexOf(' AND NOT EXISTS (WITH'),
    cycleSql = guard.sql.slice(split + 5);
  const [valid] = await r.all<{ valid: number; acyclic: number }>(
    `SELECT ${guard.sql} valid,${cycleSql} acyclic`,
    [...guard.parameters, JSON.stringify(rows), s.workspaceId],
  );
  if (!valid?.acyclic) throw new ApiFailure('CONFLICT', 'Dependencies cannot contain a cycle');
  if (!valid?.valid)
    throw new ApiFailure(
      'VALIDATION_ERROR',
      'Task project, assignee, dependency or cycle is invalid',
    );
  return guard;
}
