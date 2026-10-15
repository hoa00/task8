import { normalizeTaskView } from './task-view.ts';
import type { TaskViewState } from './task-view.ts';
import type { TaskListScope } from './list-types';

export function taskTablePreferenceKey(workspaceId: string, scope: TaskListScope): string {
  return `task8.ui.task-columns.v1:${workspaceId}:${scope.kind === 'saved' ? `saved:${scope.savedViewId}` : scope.kind === 'project' ? `project:${scope.projectId}` : scope.kind}`;
}
export function restoreTaskColumns(
  view: TaskViewState,
  key: string,
  project: boolean,
  storage: Pick<Storage, 'getItem'> | null,
): TaskViewState {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    if (saved && typeof saved === 'object')
      return normalizeTaskView({ ...view, ...saved, query: view.query, groupBy: view.groupBy });
  } catch {
    /* Invalid or unavailable personal preference uses the source defaults. */
  }
  return project
    ? { ...view, hiddenColumns: [...new Set([...view.hiddenColumns, 'project' as const])] }
    : view;
}
export function persistTaskColumns(view: TaskViewState, key: string): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ hiddenColumns: view.hiddenColumns, columnWidths: view.columnWidths }),
    );
  } catch {
    /* URL view state remains available when browser storage is blocked. */
  }
}
