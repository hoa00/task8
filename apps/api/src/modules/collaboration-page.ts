import { decodeCursor, encodeCursor, queryFingerprint } from '../shared/cursor.ts';
import { ApiFailure } from '../shared/errors.ts';
// History keeps its primary AND ID direction; this is different from task/project feeds.
export async function historyPage<T extends { id: string; createdAt: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  scope: unknown,
  descending = false,
) {
  const fingerprint = await queryFingerprint(scope),
    sortField = descending ? 'updated' : 'title',
    sortDirection = descending ? 'desc' : 'asc';
  let selected = rows;
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, {
      queryFingerprint: fingerprint,
      sortField,
      sortDirection,
    });
    const value = cursor.sortValue;
    if (typeof value !== 'string')
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid cursor for query');
    selected = rows.filter((row) => {
      const order = row.createdAt.localeCompare(value) || row.id.localeCompare(cursor.id);
      return descending ? order < 0 : order > 0;
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
            sortValue: last.createdAt,
            id: last.id,
          })
        : null,
  };
}
