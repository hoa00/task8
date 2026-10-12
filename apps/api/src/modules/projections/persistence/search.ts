import type { SearchQuerySchema, SearchResultDto } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { localeTupleSeek } from '../../../db/locale-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { textKeyVersion } from '../../../shared/text-key-encoder.ts';
import { readAccessSql } from '../../projects/access.ts';
export interface SearchTuple {
  id: string;
  kind: SearchResultDto['kind'];
  rank: number;
}
export interface SearchTotals {
  tasks: number;
  projects: number;
  people: number;
  files: number;
  comments: number;
}
const version = (alias: string) =>
  `json_extract(${alias}.readKeys,'$.v') IS NOT '${textKeyVersion}'`;
export async function searchPage(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof SearchQuerySchema>,
  needle: string,
  cursor: CursorPayload | null,
): Promise<{ rows: SearchTuple[]; total: number; totals: SearchTotals }> {
  const branches = [
    `SELECT t.id,'tasks' kind,0 rank,(${version('t')} OR ${version('p')}) invalidKeys FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId CROSS JOIN needle n WHERE t.workspaceId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} AND n.q!='' AND ((${version('t')} OR ${version('p')}) OR instr(json_extract(t.readKeys,'$.title.fold'),n.q)>0 OR instr(json_extract(t.readKeys,'$.descriptionText.fold'),n.q)>0 OR instr(lower(p.key||'-'||t.number),n.q)>0)`,
    `SELECT p.id,'projects' kind,1 rank,(${version('p')}) invalidKeys FROM projects p CROSS JOIN needle n WHERE p.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} AND n.q!='' AND ((${version('p')}) OR instr(json_extract(p.readKeys,'$.name.fold'),n.q)>0 OR instr(json_extract(p.readKeys,'$.description.fold'),n.q)>0)`,
    `SELECT m.id,'people' kind,2 rank,(${version('u')}) invalidKeys FROM workspaceMembers m JOIN users u ON u.id=m.userId CROSS JOIN needle n WHERE m.workspaceId=? AND m.removedAt IS NULL AND n.q!='' AND ((${version('u')}) OR instr(json_extract(u.readKeys,'$.name.fold'),n.q)>0 OR instr(json_extract(u.readKeys,'$.email.fold'),n.q)>0 OR instr(json_extract(u.readKeys,'$.title.fold'),n.q)>0)`,
    `SELECT f.id,'files' kind,3 rank,(${version('f')}) invalidKeys FROM files f JOIN projects p ON p.workspaceId=f.workspaceId AND p.id=f.projectId LEFT JOIN tasks t ON t.workspaceId=f.workspaceId AND t.id=f.taskId CROSS JOIN needle n WHERE f.workspaceId=? AND f.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} AND (f.taskId IS NULL OR (t.id IS NOT NULL AND t.projectId=f.projectId AND t.archivedAt IS NULL AND t.deletedAt IS NULL)) AND n.q!='' AND ((${version('f')}) OR instr(json_extract(f.readKeys,'$.name.fold'),n.q)>0)`,
    `SELECT c.id,'comments' kind,4 rank,(${version('c')}) invalidKeys FROM comments c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId CROSS JOIN needle n WHERE c.workspaceId=? AND c.deletedAt IS NULL AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql} AND n.q!='' AND ((${version('c')}) OR instr(json_extract(c.readKeys,'$.bodyText.fold'),n.q)>0)`,
  ];
  const prefix = `WITH needle AS (SELECT ? q),matches AS (${branches.join(' UNION ALL ')})`;
  const parameters = [
    needle,
    scope.workspaceId,
    scope.memberId,
    scope.workspaceId,
    scope.memberId,
    scope.workspaceId,
    scope.workspaceId,
    scope.memberId,
    scope.workspaceId,
    scope.memberId,
  ];
  const counts = await repository.all<{
    kind: SearchResultDto['kind'];
    total: number;
    invalidKeys: number;
  }>(
    `${prefix} SELECT kind,count(*) total,sum(invalidKeys) invalidKeys FROM matches GROUP BY kind`,
    parameters,
  );
  if (counts.some((row) => row.invalidKeys))
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  const totals: SearchTotals = { tasks: 0, projects: 0, people: 0, files: 0, comments: 0 };
  for (const count of counts) totals[count.kind] = count.total;
  const total =
    query.category === 'all'
      ? Object.values(totals).reduce((sum, count) => sum + count, 0)
      : totals[query.category];
  const selected = query.category === 'all' ? '1' : 'kind=?',
    categoryParameters = query.category === 'all' ? [] : [query.category];
  const seek = cursor
    ? localeTupleSeek('rank', 'id', cursor, 'asc', 'asc', 'numeric')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<SearchTuple>(
    `${prefix} SELECT id,kind,rank FROM matches WHERE ${selected} AND ${seek.sql} ORDER BY rank,id LIMIT ?`,
    [...parameters, ...categoryParameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, total, totals };
}
