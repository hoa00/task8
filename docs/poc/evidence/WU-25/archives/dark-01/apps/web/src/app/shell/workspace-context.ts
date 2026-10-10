import { createContext, useContext } from 'react';
import { useStudioQuery } from '../../data/queries';
export const WorkspaceContext = createContext<string | null>(null);
export function useWorkspaceId(): string {
  const id = useContext(WorkspaceContext);
  if (!id) throw new Error('Workspace feature requires the shared shell');
  return id;
}
export function useWorkspaceBootstrap() { return useStudioQuery('getBootstrap', { workspaceId: useWorkspaceId() }); }
