import type { ArchiveItemDto } from '@studio/contracts/api';
import type { StudioClient } from '../../data/operations.ts';
export async function loadArchive(client: StudioClient, workspaceId: string, kind: 'tasks' | 'projects', signal?: AbortSignal) {
  const items = new Map<string, ArchiveItemDto>(), cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await client.execute('listArchive', { workspaceId, query: { kind, limit: 200, ...(cursor ? { cursor } : {}) } }, signal ? { signal } : {});
    for (const item of result.data.items) items.set(item.kind === 'tasks' ? item.task.id : item.project.project.id, item);
    cursor = result.data.nextCursor ?? undefined;
    if (cursor) { if (cursors.has(cursor)) throw Error('Archive cursor did not advance'); cursors.add(cursor); }
    else if (items.size !== result.data.total) throw Error('Archive changed while loading. Try again.');
  } while (cursor);
  return [...items.values()];
}
