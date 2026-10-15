import type { BootstrapDto, EntityId, OperationInput, TaskDto } from '@studio/contracts/api';
import type { OverlayPoint } from '@studio/ui';
import type { TaskGroup } from '@studio/domain';
import type { TaskViewState } from './task-view.ts';
export type TaskListScope =
  | { kind: 'workspace' }
  | { kind: 'mine' }
  | { kind: 'project'; projectId: EntityId }
  | { kind: 'saved'; projectId: EntityId; savedViewId: EntityId };
export type ListColumnId = 'status' | 'assignee' | 'priority' | 'due' | 'labels' | 'project';
export interface ListGroup extends TaskGroup {
  collapsed?: boolean;
  createPatch?: Partial<OperationInput<'createTask'>['body']>;
}
export interface TaskListSelection {
  kind: 'bulk' | 'completion';
  selectedIds: readonly string[];
  onChange: (ids: readonly string[]) => void;
}
export interface TaskListModel {
  scope: TaskListScope;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  groups: readonly ListGroup[];
  view: TaskViewState;
  onViewChange: (view: TaskViewState) => void;
  selection: TaskListSelection;
  onTaskOpen: (id: string) => void;
  onTitleEdit: () => void;
  onTaskMenu?: (taskId: string, anchor: HTMLElement, point?: OverlayPoint) => void;
}
export interface MoveTaskIntent {
  taskId: EntityId;
  groupKey: string;
  targetId: EntityId;
  position: 'before' | 'after';
}

export interface TaskListUiState {
  expandedTaskIds?: readonly string[];
  collapsedGroupKeys?: readonly string[];
  composerGroupKey?: string | null;
}
