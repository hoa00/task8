import { createContext, useContext } from 'react';
import { normalizeTaskView } from '@studio/domain';
import type { TaskViewState } from '@studio/domain';
import { EntityIdSchema } from '@studio/contracts/api';
import type { SavedViewDto, ProjectDto } from '@studio/contracts/api';
import { restoreTaskColumns, taskTablePreferenceKey } from '../tasks/table-view';
export function projectViewKey(projectId: string, savedViewId?: string) {
  return savedViewId ? `sv:${savedViewId}` : `p:${projectId}`;
}
export function projectViewStorageKey(workspaceId: string, memberId: string, key: string) {
  return `task8.ui.project-view.v1:${workspaceId}:${memberId}:${key}`;
}
export function readProjectView(
  workspaceId: string,
  memberId: string,
  projectId: string,
  saved?: SavedViewDto,
): TaskViewState {
  const id = EntityIdSchema.parse(projectId);
  const key = projectViewStorageKey(workspaceId, memberId, projectViewKey(projectId, saved?.id));
  try {
    const raw = localStorage.getItem(key);
    if (raw) return normalizeTaskView(JSON.parse(raw) as Parameters<typeof normalizeTaskView>[0]);
  } catch {
    /* A missing personal preference initializes from the named definition once. */
  }
  const state = normalizeTaskView({ query: { filters: saved?.filters ?? [] } });
  const initialized = restoreTaskColumns(
    state,
    taskTablePreferenceKey(
      workspaceId,
      saved
        ? { kind: 'saved', projectId: id, savedViewId: saved.id }
        : { kind: 'project', projectId: id },
    ),
    true,
    (() => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    })(),
  );
  try {
    localStorage.setItem(key, JSON.stringify(initialized));
  } catch {
    /* Keep the current view usable without storage. */
  }
  return initialized;
}
export interface ProjectViewController {
  projectId: ProjectDto['id'];
  savedView?: SavedViewDto;
  view: TaskViewState;
  onViewChange: (view: TaskViewState) => void;
}
export const ProjectViewContext = createContext<ProjectViewController | null>(null);
export function useProjectView(): ProjectViewController {
  const value = useContext(ProjectViewContext);
  if (!value) throw Error('Project views require ProjectLayout');
  return value;
}
