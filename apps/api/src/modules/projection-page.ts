import { CursorPayloadSchema } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
// New WU34 feeds seek a tuple even when its anchor was restored/removed.
// IDs break ties ascending independently of the primary direction.
export async function projectionPage<T extends { id: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  scope: unknown,
  value: (row: T) => string | number,
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
  const compare = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  rows.sort(
    (a, b) => (descending ? -1 : 1) * compare(value(a), value(b)) || a.id.localeCompare(b.id),
  );
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
        cursor.sortValue === null ||
        (rows.length && typeof value(rows[0]!) !== typeof cursor.sortValue)
      )
        throw new Error();
      selected = rows.filter(
        (row) =>
          ((descending ? -1 : 1) * compare(value(row), cursor.sortValue as string | number) ||
            row.id.localeCompare(cursor.id)) > 0,
      );
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
          sortValue: value(last),
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
