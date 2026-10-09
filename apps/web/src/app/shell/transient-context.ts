import { createContext, useContext } from 'react';
import type { OverlayPoint } from '@studio/ui';
import type { TaskFormDefaults } from '../../features/tasks/field-types';
import type { HomeTaskTab } from '@studio/domain';
export interface WorkspaceTransientState { homeTaskTab: HomeTaskTab; setHomeTaskTab: (tab: HomeTaskTab) => void; selectedTaskIds: readonly string[]; selectTasks: (ids: readonly string[]) => void; openTask: (taskId: string) => void; closeTask: () => void; openTaskForm: (taskId?: string, defaults?: TaskFormDefaults) => void; openTaskMenu: (taskId: string, anchor: HTMLElement, point?: OverlayPoint) => void }
export const WorkspaceTransientContext = createContext<WorkspaceTransientState | null>(null);
export function useWorkspaceIntents(): WorkspaceTransientState {
  const value = useContext(WorkspaceTransientContext);
  if (!value) throw new Error('Workspace intents require AppShell');
  return value;
}
