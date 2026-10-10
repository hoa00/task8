import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchQuerySchema } from '@studio/contracts/api';
import type { SearchDto, SearchResultDto } from '@studio/contracts/api';
import type { StudioClient } from '../../data/operations';
import { useDataRuntime } from '../../data/context';
import { operationQueryKey } from '../../data/query-keys';

export type SearchCategory = ReturnType<typeof SearchQuerySchema.parse>['category'];
export const searchCategories = ['all', 'tasks', 'projects', 'people', 'files', 'comments'] as const;
export const searchLabel = (category: SearchCategory) => category[0]!.toUpperCase() + category.slice(1);
export const searchResultId = (row: SearchResultDto) => row.kind === 'tasks' ? row.task.id : row.kind === 'projects' ? row.project.project.id : row.kind === 'people' ? row.member.id : row.kind === 'files' ? row.file.id : row.comment.id;
export async function loadSearch(client: StudioClient, workspaceId: string, q: string, category: SearchCategory, signal: AbortSignal): Promise<SearchDto> {
  let cursor: string | undefined, first: SearchDto | undefined;
  const items = new Map<string, SearchResultDto>(), cursors = new Set<string>();
  do {
    const result = (await client.execute('search', { workspaceId, query: SearchQuerySchema.parse({ q, category, limit: 200, ...(cursor ? { cursor } : {}) }) }, { signal })).data;
    first ??= result;
    if (first.total !== result.total || JSON.stringify(first.totals) !== JSON.stringify(result.totals)) throw Error('Search changed while loading. Try again.');
    result.items.forEach(row => items.set(`${row.kind}:${searchResultId(row)}`, row));
    cursor = result.nextCursor ?? undefined;
    if (cursor) { if (cursors.has(cursor)) throw Error('Search cursor did not advance'); cursors.add(cursor); }
  } while (cursor);
  if (!first || items.size !== first.total) throw Error('Search coverage is incomplete');
  return { ...first, items: [...items.values()], nextCursor: null };
}
export function useWorkspaceSearch(workspaceId: string, q: string, category: SearchCategory, enabled = true) {
  const { client } = useDataRuntime(), normalized = q.trim();
  const [settled, setSettled] = useState({ workspaceId, q: normalized });
  useEffect(() => { const timer = setTimeout(() => setSettled({ workspaceId, q: normalized }), 150); return () => clearTimeout(timer); }, [workspaceId, normalized]);
  // The key follows the CURRENT input immediately, so an old request is
  // unsubscribed/cancelled even during the debounce window. Never keep prior data.
  const ready = settled.workspaceId === workspaceId && settled.q === normalized;
  const query = SearchQuerySchema.parse({ q: normalized || ' ', category, limit: 200 });
  const result = useQuery({ queryKey: operationQueryKey('search', { workspaceId, query }), queryFn: ({ signal }) => loadSearch(client, workspaceId, normalized, category, signal), enabled: enabled && !!normalized && ready });
  const active = enabled && !!normalized && ready;
  return { ...result, data: active ? result.data : undefined, error: active ? result.error : null, retrySearch: () => { if (active) return result.refetch(); return undefined; }, debouncing: enabled && !!normalized && !ready };
}
