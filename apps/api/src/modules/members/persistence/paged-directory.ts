import type { MemberDto, MemberQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { localeTupleSeek } from '../../../db/locale-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { textKeyVersion } from '../../../shared/text-key-encoder.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
export type DirectoryPageProjection = Omit<MemberDto, 'lastSeenAt'> & { lastSeenAt: number | null };
const columns =
  'm.id,m.workspaceId,m.userId,u.name,u.displayEmail email,u.title,u.avatarColor,u.timezone,m.role,m.status,m.teamId,m.lastSeenAt,m.version';
export async function pagedDirectory(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof MemberQuerySchema>,
  cursor: CursorPayload | null,
): Promise<{ rows: DirectoryPageProjection[]; total: number }> {
  const invalid = `json_extract(u.readKeys,'$.v') IS NOT '${textKeyVersion}'`;
  const where = ['m.workspaceId=?', 'm.removedAt IS NULL'];
  const parameters: (string | number | null)[] = [scope.workspaceId];
  if (query.teamId) {
    where.push('m.teamId=?');
    parameters.push(query.teamId);
  }
  if (query.status) {
    where.push('m.status=?');
    parameters.push(query.status);
  }
  if (query.q) {
    where.push(
      `((${invalid}) OR instr(json_extract(u.readKeys,'$.name.fold'),?)>0 OR instr(json_extract(u.readKeys,'$.email.fold'),?)>0 OR instr(json_extract(u.readKeys,'$.title.fold'),?)>0)`,
    );
    const q = textKeyEncoder.lower(query.q);
    parameters.push(q, q, q);
  }
  const from = 'workspaceMembers m JOIN users u ON u.id=m.userId';
  const predicate = where.map((sql) => `(${sql})`).join(' AND ');
  const count = required(
    (
      await repository.all<{ total: number; invalidKeys: number }>(
        `SELECT count(*) total,coalesce(sum(${invalid}),0) invalidKeys FROM ${from} WHERE ${predicate}`,
        parameters,
      )
    )[0],
    'Missing directory count',
  );
  if (count.invalidKeys)
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  const seek = cursor
    ? localeTupleSeek("json_extract(u.readKeys,'$.name.locale')", 'm.id', cursor, 'asc')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<DirectoryPageProjection>(
    `SELECT ${columns} FROM ${from} WHERE ${predicate} AND ${seek.sql} ORDER BY json_extract(u.readKeys,'$.name.locale'),m.id LIMIT ?`,
    [...parameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, total: count.total };
}
