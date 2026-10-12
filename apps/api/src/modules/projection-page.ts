import { decodeCursor, encodeCursor, queryFingerprint } from '../shared/cursor.ts';
import { ApiFailure } from '../shared/errors.ts';
// Projection primary direction varies; ID ties stay ascending.
export async function projectionPage<T extends { id: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  scope: unknown,
  value: (row: T) => string | number,
  descending = false,
) {
  const fingerprint = await queryFingerprint(scope),
    sortField = descending ? 'updated' : 'title',
    sortDirection = descending ? 'desc' : 'asc';
  const compare = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  rows.sort(
    (a, b) => (descending ? -1 : 1) * compare(value(a), value(b)) || a.id.localeCompare(b.id),
  );
  let selected = rows;
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, {
      queryFingerprint: fingerprint,
      sortField,
      sortDirection,
    });
    const sortValue = cursor.sortValue;
    if (sortValue === null || (rows[0] && typeof value(rows[0]) !== typeof sortValue))
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid cursor for query');
    selected = rows.filter(
      (row) =>
        ((descending ? -1 : 1) * compare(value(row), sortValue) ||
          row.id.localeCompare(cursor.id)) > 0,
    );
  }
  const items = selected.slice(0, query.limit),
    last = items.at(-1);
  return {
    items,
    total: rows.length,
    nextCursor:
      selected.length > items.length && last
        ? encodeCursor({
            formatVersion: 1,
            queryFingerprint: fingerprint,
            sortField,
            sortDirection,
            sortValue: value(last),
            id: last.id,
          })
        : null,
  };
}
