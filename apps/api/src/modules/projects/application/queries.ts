import type { EntityId, ProjectListItemDto, ProjectQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { members } from '../../members/projections.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { pagedProjects } from '../persistence/paged-projects.ts';
import { projectCatalogForIds } from './scoped-catalog.ts';
import { projectRow } from '../access.ts';
import { listProjectMembersReadProjectMembers } from '../persistence/queries.ts';
import { projectCatalog, projectDto } from '../projections.ts';
export async function listProjects(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof ProjectQuerySchema>,
  now: number,
) {
  const sortField =
    query.sort === 'due'
      ? 'due'
      : query.sort === 'recent'
        ? 'updated'
        : query.sort === 'progress'
          ? 'manual'
          : 'title';
  const { binding, cursor } = await bindReadCursor(
    query,
    { scope: s, kind: 'projects', ...query, cursor: undefined, limit: undefined },
    sortField,
    query.sort === 'recent' ? 'desc' : 'asc',
  );
  const selected = await pagedProjects(r, s, query, cursor);
  const page = finishReadPage(selected.rows, selected.total, query.limit, binding, (row) => ({
    id: row.id,
    value: row.readSortValue,
  }));
  const projections = await projectCatalogForIds(
    r,
    s,
    now,
    page.items.map((item) => item.id),
  );
  const byId = new Map<string, ProjectListItemDto>(
    projections.map((item) => [item.project.id, item]),
  );
  return {
    ...page,
    items: page.items.flatMap((item) => {
      const projection = byId.get(item.id);
      return projection ? [projection] : [];
    }),
  };
}
export async function readProject(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  now: number,
) {
  const p = await projectRow(r, s, id);
  return await projectDto(r, s, p, now);
}
export async function listProjectMembers(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  await projectRow(r, s, id, {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'read',
  });
  const grants = await listProjectMembersReadProjectMembers(r, s, id),
    ms = await members(r, s);
  return grants.map((g) => ({
    member: ms.find((m) => m.id === g.memberId),
    permission: g.permission,
  }));
}
export async function projectSummary(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  now: number,
) {
  await projectRow(r, s, id, {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'read',
  });
  const row = (await projectCatalog(r, s, now)).find((p) => p.project.id === id);
  if (row?.access !== 'allowed') throw new ApiFailure('NOT_FOUND', 'Project not found');
  return row.summary;
}
