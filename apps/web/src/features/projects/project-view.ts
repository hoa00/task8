import { createContext, useContext } from 'react';
import { normalizeTaskView } from '../tasks/task-view.ts';
import type { TaskViewState } from '../tasks/task-view.ts';
import { EntityIdSchema } from '@studio/contracts/api';
import type { SavedViewDto, ProjectDto } from '@studio/contracts/api';
import { restoreTaskColumns, taskTablePreferenceKey } from '../tasks/table-view.ts';
export function projectViewKey(projectId: string, savedViewId?: string) {
  return savedViewId ? `sv:${savedViewId}` : `p:${projectId}`;
}
export function projectViewStorageKey(workspaceId: string, memberId: string, key: string) {
  return `task8.ui.project-view.v1:${workspaceId}:${memberId}:${key}`;
}
export function decodeProjectView(raw: string | null, fallback: TaskViewState): TaskViewState {
  try {
    return raw
      ? normalizeTaskView(JSON.parse(raw) as Parameters<typeof normalizeTaskView>[0])
      : fallback;
  } catch {
    return fallback;
  }
}
export function readProjectView(
  workspaceId: string,
  memberId: string,
  projectId: string,
  saved?: SavedViewDto,
  storage: Pick<Storage, 'getItem'> | null = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
): TaskViewState {
  const id = EntityIdSchema.parse(projectId),
    key = projectViewStorageKey(workspaceId, memberId, projectViewKey(projectId, saved?.id));
  const initial = restoreTaskColumns(
    normalizeTaskView({ query: { filters: saved?.filters ?? [] } }),
    taskTablePreferenceKey(
      workspaceId,
      saved
        ? { kind: 'saved', projectId: id, savedViewId: saved.id }
        : { kind: 'project', projectId: id },
    ),
    true,
    storage,
  );
  try {
    return decodeProjectView(storage?.getItem(key) ?? null, initial);
  } catch {
    return initial;
  }
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
