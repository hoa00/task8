import { createContext, useContext } from 'react';
export interface WorkspaceTransientState { selectedTaskIds: readonly string[]; selectTasks: (ids: readonly string[]) => void; openTask: (taskId: string) => void; closeTask: () => void }
export const WorkspaceTransientContext = createContext<WorkspaceTransientState | null>(null);
export function useWorkspaceIntents(): WorkspaceTransientState {
  const value = useContext(WorkspaceTransientContext);
  if (!value) throw new Error('Workspace intents require AppShell');
  return value;
}
