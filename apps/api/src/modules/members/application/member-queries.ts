import type { EntityId, MemberQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { projectCatalogForIds } from '../../projects/projections.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { pagedDirectory } from '../persistence/paged-directory.ts';
import { memberDto } from '../mapper.ts';
import { memberTaskCounts, memberProjectIds } from '../persistence/summary.ts';
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
    date = await today(r, s, now);
  const counts = await memberTaskCounts(r, s, m.id, date),
    ids = await memberProjectIds(r, s, m.id);
  const projects = await projectCatalogForIds(
    r,
    s,
    now,
    ids.map((row) => row.id),
  );
  return { memberId: m.id, ...counts, projects };
}
