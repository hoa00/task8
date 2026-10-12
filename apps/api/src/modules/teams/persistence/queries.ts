import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { TeamRow } from '../projections.ts';

export function listTeamsReadTeams(r: RequestRepository, s: WorkspaceContext) {
  return r.all<TeamRow>(
    'SELECT * FROM teams WHERE workspaceId=? AND deletedAt IS NULL ORDER BY name,id',
    [s.workspaceId],
  );
}
