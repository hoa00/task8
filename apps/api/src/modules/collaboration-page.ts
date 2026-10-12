import { CursorPayloadSchema } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
// History cursors identify a tuple, not a row that must still exist after a deletion.
export async function historyPage<T extends { id: string; createdAt: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  scope: unknown,
  descending = false,
) {
  const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(scope)),
    ),
    queryFingerprint = [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  const sortField = descending ? 'updated' : 'title',
    sortDirection = descending ? 'desc' : 'asc';
  let selected = rows;
  if (query.cursor) {
    try {
      const decoded = new TextDecoder().decode(
          Uint8Array.from(atob(query.cursor.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
            c.charCodeAt(0),
          ),
        ),
        cursor = CursorPayloadSchema.parse(JSON.parse(decoded));
      if (
        cursor.queryFingerprint !== queryFingerprint ||
        cursor.sortField !== sortField ||
        cursor.sortDirection !== sortDirection ||
        typeof cursor.sortValue !== 'string'
      )
        throw new Error();
      selected = rows.filter((row) => {
        const order =
          row.createdAt.localeCompare(cursor.sortValue as string) ||
          row.id.localeCompare(cursor.id);
        return descending ? order < 0 : order > 0;
      });
    } catch {
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid cursor for query');
    }
  }
  const items = selected.slice(0, query.limit),
    last = items.at(-1),
    payload = last
      ? JSON.stringify({
          formatVersion: 1,
          queryFingerprint,
          sortField,
          sortDirection,
          sortValue: last.createdAt,
          id: last.id,
        })
      : '';
  return {
    items,
    total: rows.length,
    nextCursor:
      selected.length > items.length && last
        ? btoa(String.fromCharCode(...new TextEncoder().encode(payload)))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '')
        : null,
  };
}
