import type { CursorPayload } from './cursor.ts';
import { decodeCursor, encodeCursor, queryFingerprint } from './cursor.ts';
export interface PageCursorBinding {
  queryFingerprint: string;
  sortField: CursorPayload['sortField'];
  sortDirection: CursorPayload['sortDirection'];
}
export interface ReadPage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}
export async function bindReadCursor(
  query: { cursor?: string | undefined },
  scope: unknown,
  sortField: CursorPayload['sortField'],
  sortDirection: CursorPayload['sortDirection'],
): Promise<{ binding: PageCursorBinding; cursor: CursorPayload | null }> {
  const binding = { queryFingerprint: await queryFingerprint(scope), sortField, sortDirection };
  return { binding, cursor: query.cursor ? decodeCursor(query.cursor, binding) : null };
}
export function finishReadPage<T>(
  rows: readonly T[],
  total: number,
  limit: number,
  binding: PageCursorBinding,
  tuple: (row: T) => { id: string; value: string | number | null },
): ReadPage<T> {
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    total,
    nextCursor:
      rows.length > items.length && last
        ? encodeCursor({
            formatVersion: 1,
            ...binding,
            sortValue: tuple(last).value,
            id: tuple(last).id,
          })
        : null,
  };
}
