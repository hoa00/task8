import type { ProjectQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { localeTupleSeek } from '../../../db/locale-seek.ts';
import { dueLocaleKeySql, instantLocaleKeySql } from '../../../db/read-expressions.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import { textKeyVersion } from '../../../shared/text-key-encoder.ts';
import { readAccessSql } from '../access.ts';
export interface ProjectPageTuple {
  id: string;
  readSortValue: string | number;
}
export async function pagedProjects(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof ProjectQuerySchema>,
  cursor: CursorPayload | null,
): Promise<{ rows: ProjectPageTuple[]; total: number }> {
  const invalid = `json_extract(p.readKeys,'$.v') IS NOT '${textKeyVersion}'`;
  const where = [
    'p.workspaceId=?',
    'p.deletedAt IS NULL',
    query.archived
      ? '(p.archivedAt IS NOT NULL AND p.archivedAt!=0)'
      : '(p.archivedAt IS NULL OR p.archivedAt=0)',
  ];
  const parameters: (string | number | null)[] = [scope.workspaceId];
  if (query.status) {
    where.push('p.status=?');
    parameters.push(query.status);
  }
  if (query.q) {
    where.push(
      `((${invalid}) OR instr(json_extract(p.readKeys,'$.name.fold'),?)>0 OR instr(json_extract(p.readKeys,'$.description.fold'),?)>0)`,
    );
    const q = textKeyEncoder.lower(query.q);
    parameters.push(q, q);
  }
  const predicate = where.map((sql) => `(${sql})`).join(' AND ');
  const count = required(
    (
      await repository.all<{ total: number; invalidKeys: number }>(
        `SELECT count(*) total,coalesce(sum(${invalid}),0) invalidKeys FROM projects p WHERE ${predicate}`,
        parameters,
      )
    )[0],
    'Missing project count',
  );
  if (count.invalidKeys)
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  const tasks =
    'FROM tasks t WHERE t.workspaceId=p.workspaceId AND t.projectId=p.id AND t.archivedAt IS NULL AND t.deletedAt IS NULL';
  const progress = `CASE WHEN p.allowed=0 OR p.archivedAt IS NOT NULL THEN 0 ELSE -coalesce(CAST(round(100.0*(SELECT count(*) ${tasks} AND t.status='done')/nullif((SELECT count(*) ${tasks}),0)) AS INTEGER),0) END`;
  const value =
    query.sort === 'name'
      ? 'p.name'
      : query.sort === 'due'
        ? "coalesce(p.dueDate,'9999')"
        : query.sort === 'progress'
          ? progress
          : "CASE WHEN p.allowed THEN strftime('%Y-%m-%dT%H:%M:%fZ',p.lastActivityAt/1000.0,'unixepoch') ELSE '' END";
  const key =
    query.sort === 'name'
      ? "(p.readKeys ->> '$.name.locale')"
      : query.sort === 'due'
        ? dueLocaleKeySql('p.dueDate')
        : query.sort === 'progress'
          ? progress
          : `CASE WHEN p.allowed THEN ${instantLocaleKeySql('p.lastActivityAt')} ELSE '010100' END`;
  const direction = query.sort === 'recent' ? 'desc' : 'asc';
  const seek = cursor
    ? localeTupleSeek(
        'readSortKey',
        'id',
        cursor,
        direction,
        'asc',
        query.sort === 'progress' ? 'numeric' : 'text',
      )
    : { sql: '1', parameters: [] };
  const rows = await repository.all<ProjectPageTuple>(
    `WITH catalog AS (SELECT p.*,(${readAccessSql}) allowed FROM projects p WHERE ${predicate}),tuples AS (SELECT p.id,${value} readSortValue,${key} readSortKey FROM catalog p) SELECT id,readSortValue FROM tuples WHERE ${seek.sql} ORDER BY readSortKey ${direction === 'desc' ? 'DESC' : 'ASC'},id ASC LIMIT ?`,
    [scope.memberId, ...parameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, total: count.total };
}
