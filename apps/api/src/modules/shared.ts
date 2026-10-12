import { decodeCursor, encodeCursor, queryFingerprint } from '../shared/cursor.ts';
import { ApiFailure } from '../shared/errors.ts';

// Reauthorize in final SQL as well as middleware/preflight. A local identity never supplies role.

export async function page<T extends { id: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  fingerprintInput: unknown,
  value: (row: T) => string | number,
  sortField: 'title' | 'due' | 'updated' | 'manual' = 'title',
) {
  const fingerprint = await queryFingerprint(fingerprintInput);
  const sortDirection = sortField === 'updated' ? 'desc' : 'asc';
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
    selected = rows.filter((row) => {
      const current = value(row);
      const order =
        typeof current === 'number' && typeof sortValue === 'number'
          ? current - sortValue
          : String(current).localeCompare(String(sortValue));
      return ((sortDirection === 'desc' ? -1 : 1) * order || row.id.localeCompare(cursor.id)) > 0;
    });
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
