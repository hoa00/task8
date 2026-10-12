import type { EntityId, TextQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { members } from '../../members/projections.ts';
import { projectCatalog } from '../../projects/projections.ts';
import { activeTasks } from '../../tasks/projections.ts';
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
    ms = (await members(r, s)).filter((m) => m.teamId === team.id),
    ts = (await activeTasks(r, s)).filter((t) => ms.some((m) => m.id === t.assigneeId)),
    ps = await projectCatalog(r, s, now);
  return {
    teamId: team.id,
    open: ts.filter((t) => t.status !== 'done').length,
    completed: ts.filter((t) => t.status === 'done').length,
    projects: ps.filter(
      (p) => p.access === 'allowed' && !p.project.archivedAt && p.project.teamId === team.id,
    ),
    workload: ms.map((m) => ({
      memberId: m.id,
      open: ts.filter((t) => t.assigneeId === m.id && t.status !== 'done').length,
    })),
  };
}
