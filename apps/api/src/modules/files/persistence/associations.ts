import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
export interface TaskFileAssociation {
  readonly id: string;
  readonly projectId: string;
}
export function moveTaskFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  moves: readonly TaskFileAssociation[],
  now: number,
  marker: string,
  gate: SqlPredicate,
): D1PreparedStatement {
  return r.prepare(
    `UPDATE files SET projectId=(SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=files.taskId),version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND taskId IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${gate.sql}`,
    [JSON.stringify(moves), now, marker, s.workspaceId, JSON.stringify(moves), ...gate.parameters],
  );
}
