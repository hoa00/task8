import { encodeMockCursor as encode, decodeMockCursor, anchorCursorSchema } from './cursor.ts';
import { fail, fingerprint } from './primitives.ts';

export async function cursorPage<T extends { id: string; createdAt?: string }>(
  rows: T[],
  query: { cursor?: string | undefined; limit: number },
  scope: object,
  descending: boolean,
) {
  const signature = await fingerprint(scope);
  let start = 0;
  if (query.cursor) {
    try {
      const value = decodeMockCursor(query.cursor, anchorCursorSchema);
      if (
        value.signature !== signature ||
        typeof value.id !== 'string' ||
        typeof value.at !== 'string'
      )
        return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor');
      const index = rows.findIndex((row) => {
        const order =
          (row.createdAt ?? '').localeCompare(value.at) || row.id.localeCompare(value.id);
        return descending ? order < 0 : order > 0;
      });
      start = index < 0 ? rows.length : index;
    } catch {
      return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor');
    }
  }
  const items = rows.slice(start, start + query.limit),
    last = items.at(-1);
  return {
    items,
    total: rows.length,
    nextCursor:
      last && start + items.length < rows.length
        ? encode({ signature, id: last.id, at: last.createdAt ?? '' })
        : null,
  };
}
