import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DataContext } from './context.ts';
import type { DataRuntime } from './runtime.ts';

export interface StudioDataProviderProps { runtime: DataRuntime; queryClient: QueryClient; children: ReactNode }
export function StudioDataProvider({ runtime, queryClient, children }: StudioDataProviderProps) {
  return <DataContext value={runtime}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></DataContext>;
}
