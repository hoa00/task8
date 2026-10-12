import type { EntityId, ProjectQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { members } from '../../members/projections.ts';
import { page } from '../../shared.ts';
import { projectRow } from '../access.ts';
import {
  listProjectMembersReadProjectMembers,
  listProjectsReadProjects,
} from '../persistence/queries.ts';
import { projectCatalog, projectDto } from '../projections.ts';
export async function listProjects(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof ProjectQuerySchema>,
  now: number,
) {
  const rows = await projectCatalog(r, s, now);
  const lifecycle = await listProjectsReadProjects(r, s);
  const selected = rows.filter(
    (row) =>
      !!lifecycle.find((p) => p.id === row.project.id)?.archivedAt === query.archived &&
      (!query.status || row.project.status === query.status) &&
      (!query.q ||
        row.project.name.toLowerCase().includes(query.q.toLowerCase()) ||
        (row.access === 'allowed' ? row.project.description : row.project.catalogSummary)
          .toLowerCase()
          .includes(query.q.toLowerCase())),
  );
  const value = (row: (typeof selected)[number]) =>
    query.sort === 'name'
      ? row.project.name
      : query.sort === 'due'
        ? (row.project.dueDate ?? '9999')
        : query.sort === 'progress'
          ? row.access === 'allowed'
            ? -row.summary.progress
            : 0
          : row.access === 'allowed'
            ? row.project.lastActivityAt
            : '';
  selected.sort((a, b) => {
    const av = value(a),
      bv = value(b),
      order =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
    return (query.sort === 'recent' ? -order : order) || a.project.id.localeCompare(b.project.id);
  });
  const result = await page(
    selected.map((row) => ({ id: row.project.id, row })),
    query,
    { scope: s, kind: 'projects', ...query, cursor: undefined, limit: undefined },
    (item) => value(item.row),
    query.sort === 'due'
      ? 'due'
      : query.sort === 'recent'
        ? 'updated'
        : query.sort === 'progress'
          ? 'manual'
          : 'title',
  );
  return { ...result, items: result.items.map((item) => item.row) };
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
