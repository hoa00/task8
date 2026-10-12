import type { EntityId, MemberQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { projectCatalog } from '../../projects/projections.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { pagedDirectory } from '../persistence/paged-directory.ts';
import { memberDto } from '../mapper.ts';
import { activeTasks } from '../../tasks/projections.ts';
import { today } from '../../workspaces/index.ts';
import { member } from './directory.ts';
export async function listMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof MemberQuerySchema>,
) {
  const { binding, cursor } = await bindReadCursor(
    query,
    { scope: s, kind: 'members', ...query, cursor: undefined, limit: undefined },
    'title',
    'asc',
  );
  const result = await pagedDirectory(r, s, query, cursor);
  return finishReadPage(result.rows.map(memberDto), result.total, query.limit, binding, (row) => ({
    id: row.id,
    value: row.name,
  }));
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
