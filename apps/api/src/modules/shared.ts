import { CursorPayloadSchema, EntityIdSchema } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import type { MemberDto, EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';

export const instant = (value: number) => new Date(value).toISOString();
export const nullableInstant = (value: number | null) => (value === null ? null : instant(value));
export function newId(): EntityId {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let stamp = BigInt(Date.now());
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(stamp & 255n);
    stamp >>= 8n;
  }
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return EntityIdSchema.parse(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
}
export function administrator(member: MemberDto) {
  if (!['Owner', 'Admin'].includes(member.role))
    throw new ApiFailure('FORBIDDEN', 'Workspace administrator required');
}
export function creator(member: MemberDto) {
  if (member.role === 'Guest') throw new ApiFailure('FORBIDDEN', 'Guests cannot create projects');
}
// Reauthorize in final SQL as well as middleware/preflight. A local identity never supplies role.
export const actorSql = (admin = false, create = false) =>
  `EXISTS (SELECT 1 FROM workspaceMembers actor WHERE actor.workspaceId=? AND actor.id=? AND actor.status='active' AND actor.removedAt IS NULL${admin ? " AND actor.role IN ('Owner','Admin')" : create ? " AND actor.role!='Guest'" : ''})`;
export const actorParameters = (scope: WorkspaceContext) => [scope.workspaceId, scope.memberId];
export const markerSql = (table: 'projects' | 'teams' | 'workspaces' | 'users') =>
  `EXISTS (SELECT 1 FROM ${table} gate WHERE gate.id=? AND gate.lastMutationId=?)`;
export function patchSql(patch: Record<string, string | number | null | undefined>) {
  const entries = Object.entries(patch).filter(
    (entry): entry is [string, string | number | null] => entry[1] !== undefined,
  );
  return {
    sql: entries.map(([key]) => `${key}=?`).join(','),
    parameters: entries.map(([, value]) => value),
  };
}
export function fitBatch(repository: RequestRepository, count: number, finalReads: number) {
  if (repository.statements + count + finalReads > 50)
    throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Command exceeds query budget');
}
export async function page<T extends { id: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  fingerprintInput: unknown,
  value: (row: T) => string | number,
  sortField: 'title' | 'due' | 'updated' | 'manual' = 'title',
) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(fingerprintInput)),
  );
  const queryFingerprint = [...new Uint8Array(bytes)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  let start = 0;
  if (query.cursor) {
    try {
      const encoded = query.cursor.replaceAll('-', '+').replaceAll('_', '/'),
        decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
      const cursor = CursorPayloadSchema.parse(JSON.parse(decoded));
      if (
        cursor.queryFingerprint !== queryFingerprint ||
        cursor.sortField !== sortField ||
        cursor.sortDirection !== (sortField === 'updated' ? 'desc' : 'asc')
      )
        throw new Error();
      const at = rows.findIndex((row) => row.id === cursor.id && value(row) === cursor.sortValue);
      if (at < 0) throw new Error();
      start = at + 1;
    } catch {
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid cursor for query');
    }
  }
  const items = rows.slice(start, start + query.limit),
    last = items.at(-1);
  const cursor = last
    ? JSON.stringify({
        formatVersion: 1,
        queryFingerprint,
        sortField,
        sortDirection: sortField === 'updated' ? 'desc' : 'asc',
        sortValue: value(last),
        id: last.id,
      })
    : '';
  return {
    items,
    total: rows.length,
    nextCursor:
      start + items.length < rows.length && last
        ? btoa(String.fromCharCode(...new TextEncoder().encode(cursor)))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '')
        : null,
  };
}
