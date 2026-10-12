import type { EntityId, TextQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { members } from '../../members/projections.ts';
import { projectCatalogForIds } from '../../projects/projections.ts';
import { teamWorkload, teamProjectIds } from '../persistence/summary.ts';
import { listTeamsReadTeams } from '../persistence/queries.ts';
import { teamDto, teamRow } from '../projections.ts';
export async function listTeams(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof TextQuerySchema>,
) {
  const rows = await listTeamsReadTeams(r, s),
    ms = await members(r, s);
  return rows
    .filter((t) => (t.name + ' ' + t.description).toLowerCase().includes(query.q.toLowerCase()))
    .map((t) => teamDto(t, ms));
}
export async function readTeam(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  return teamDto(await teamRow(r, s, id), await members(r, s));
}
export async function teamSummary(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  now: number,
) {
  const team = await teamRow(r, s, id),
    workload = await teamWorkload(r, s, team.id),
    ids = await teamProjectIds(r, s, team.id);
  const projects = await projectCatalogForIds(
    r,
    s,
    now,
    ids.map((row) => row.id),
  );
  return {
    teamId: team.id,
    open: workload.reduce((sum, row) => sum + row.open, 0),
    completed: workload.reduce((sum, row) => sum + row.completed, 0),
    projects,
    workload: workload.map(({ memberId, open }) => ({ memberId, open })),
  };
}
