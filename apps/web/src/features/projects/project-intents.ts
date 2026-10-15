import type { ProjectDto } from '@studio/contracts/api';
import { createContext, useContext } from 'react';
export interface ProjectIntents {
  newProject: () => void;
  archiveProject: (project: ProjectDto) => void;
  deleteProject: (project: ProjectDto) => void;
  editProject: (id: string) => void;
  shareProject: (id: string) => void;
  projectMenu: (id: string, anchor: HTMLElement, point?: { x: number; y: number }) => void;
  favoriteProject: (id: string) => void;
  reorderProjects: (projectIds: readonly string[]) => Promise<void>;
}
export const ProjectIntentContext = createContext<ProjectIntents | null>(null);
export function useProjectIntents(): ProjectIntents {
  const value = useContext(ProjectIntentContext);
  if (!value) throw Error('Project intents require AppShell');
  return value;
}
