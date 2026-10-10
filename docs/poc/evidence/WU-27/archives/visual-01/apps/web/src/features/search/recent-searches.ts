import { useSearchIntents } from './search-intents';
const initial = ['homepage', 'Sarah', 'wireframes'];
export const recentSearchKey = (workspaceId: string, memberId: string) => `task8.ui.search.v1:${workspaceId}:${memberId}`;
export function readRecentSearches(key: string): string[] { try { const rows: unknown = JSON.parse(localStorage.getItem(key) ?? 'null'); if (Array.isArray(rows) && rows.every(row => typeof row === 'string' && row.length <= 500)) return rows.slice(0, 5); } catch { /* Optional UI preference. */ } return initial; }
export function useRecentSearches() { return useSearchIntents().recent; }
