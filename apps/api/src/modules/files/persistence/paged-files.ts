import type { FileQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { localeTupleSeek } from '../../../db/locale-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import { textKeyVersion } from '../../../shared/text-key-encoder.ts';
import type { FileRow } from './model.ts';
export interface FilePageProjection extends FileRow {
  readSortValue: string | number;
}
export async function pagedFiles(
  repository: RequestRepository,
  scope: WorkspaceContext,
  projectId: string,
  query: z.infer<typeof FileQuerySchema>,
  cursor: CursorPayload | null,
): Promise<{ rows: FilePageProjection[]; total: number }> {
  const invalid = `json_extract(f.readKeys,'$.v') IS NOT '${textKeyVersion}'`;
  const where = [
    'f.workspaceId=?',
    'f.projectId=?',
    'f.deletedAt IS NULL',
    `(f.taskId IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.workspaceId=f.workspaceId AND t.id=f.taskId AND t.projectId=f.projectId AND t.deletedAt IS NULL AND t.archivedAt IS NULL))`,
  ];
  const parameters: (string | number | null)[] = [scope.workspaceId, projectId];
  if (query.q) {
    where.push(`((${invalid}) OR instr(json_extract(f.readKeys,'$.name.fold'),?)>0)`);
    parameters.push(textKeyEncoder.lower(query.q));
  }
  if (query.type) {
    where.push('f.fileType=?');
    parameters.push(query.type);
  }
  const predicate = where.map((sql) => `(${sql})`).join(' AND ');
  const count = required(
    (
      await repository.all<{ total: number; invalidKeys: number }>(
        `SELECT count(*) total,coalesce(sum(${invalid}),0) invalidKeys FROM files f WHERE ${predicate}`,
        parameters,
      )
    )[0],
    'Missing file count',
  );
  if (count.invalidKeys)
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  const numeric = query.sort === 'recent' || query.sort === 'size';
  const value =
    query.sort === 'recent'
      ? '-f.createdAt'
      : query.sort === 'size'
        ? '(CASE WHEN f.sizeBytes IS NULL THEN 1 ELSE -f.sizeBytes END)'
        : query.sort === 'type'
          ? 'f.fileType'
          : 'f.name';
  const key = numeric
    ? value
    : query.sort === 'type'
      ? "(f.readKeys ->> '$.fileType.locale')"
      : "(f.readKeys ->> '$.name.locale')";
  const seek = cursor
    ? localeTupleSeek(key, 'f.id', cursor, 'asc', 'asc', numeric ? 'numeric' : 'text')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<FilePageProjection>(
    `SELECT f.*,${value} readSortValue FROM files f WHERE ${predicate} AND ${seek.sql} ORDER BY ${key},f.id LIMIT ?`,
    [...parameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, total: count.total };
}
