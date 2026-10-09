import { useQuery } from '@tanstack/react-query';
import type { MemberDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { queryKeys } from '../../data/query-keys';
export { loadProjectCatalogue } from './loadProjectCatalogue';
export function useCompleteMembers(workspaceId: string) { const { client } = useDataRuntime(); return useQuery({ queryKey: [...queryKeys.workspace(workspaceId), 'members', 'complete'], queryFn: async ({ signal }) => { let cursor: string | undefined; const items = new Map<string, MemberDto>(), cursors = new Set<string>(); do { const result = await client.execute('listMembers', { workspaceId, query: { limit: 200, ...(cursor ? { cursor } : {}) } }, signal ? { signal } : {}); result.data.items.forEach(item => items.set(item.id, item)); cursor = result.data.nextCursor ?? undefined; if (cursor) { if (cursors.has(cursor)) throw Error('Member cursor did not advance'); cursors.add(cursor); } else if (items.size !== result.data.total) throw Error('Members changed while loading'); } while (cursor); return { items: [...items.values()], coverage: 'complete' as const }; } }); }
