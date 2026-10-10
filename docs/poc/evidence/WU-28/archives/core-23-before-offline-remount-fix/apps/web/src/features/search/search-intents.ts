import { createContext, useContext } from 'react';
import type { SearchResultDto } from '@studio/contracts/api';
export interface SearchIntents { signOut: () => void; openPalette: (mode?: 'cmd' | 'search' | 'ws') => void; openShortcuts: () => void; openResult: (result: SearchResultDto) => void; recent: { rows: readonly string[]; remember: (q: string) => void } }
export const SearchIntentContext = createContext<SearchIntents | null>(null);
export function useSearchIntents() { const value = useContext(SearchIntentContext); if (!value) throw Error('Search intents require AppShell'); return value; }
