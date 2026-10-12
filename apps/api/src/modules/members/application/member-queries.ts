import type { EntityId, MemberQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { projectCatalog } from '../../projects/projections.ts';
import { page } from '../../shared.ts';
import { activeTasks } from '../../tasks/projections.ts';
import { today } from '../../workspaces/index.ts';
import { member, members } from './directory.ts';
export async function listMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof MemberQuerySchema>,
) {
  const rows = (await members(r, s))
    .filter(
      (m) =>
        (!query.teamId || m.teamId === query.teamId) &&
        (!query.status || m.status === query.status) &&
        (!query.q ||
          [m.name, m.email, m.title].some((v) => v.toLowerCase().includes(query.q.toLowerCase()))),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return await page(
    rows,
    query,
    { scope: s, kind: 'members', ...query, cursor: undefined, limit: undefined },
    (m) => m.name,
  );
}
export async function memberSummary(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  now: number,
) {
  const m = await member(r, s, id),
    ts = (await activeTasks(r, s)).filter((t) => t.assigneeId === m.id),
    date = await today(r, s, now),
    ps = await projectCatalog(r, s, now);
  return {
    memberId: m.id,
    open: ts.filter((t) => t.status !== 'done').length,
    done: ts.filter((t) => t.status === 'done').length,
    overdue: ts.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < date).length,
    projects: ps.filter(
      (p) =>
        p.access === 'allowed' &&
        !p.project.archivedAt &&
        p.project.memberIds.includes(m.id) &&
        p.project.status !== 'complete',
    ),
  };
}
