import { createContext, useContext } from 'react';
import type { DataRuntime } from './runtime.ts';

export const DataContext = createContext<DataRuntime | null>(null);
export function useDataRuntime(): DataRuntime {
  const runtime = useContext(DataContext);
  if (!runtime) throw new Error('Data hooks require StudioDataProvider');
  return runtime;
}
