import type { BootstrapDto, TaskDto, TaskQuery } from '@studio/contracts/api';
import type { OverlayPoint } from '@studio/ui';
import type { TaskListScope } from './list-types';
export type TaskBoardScope = Exclude<TaskListScope, { kind: 'mine' }>;
export interface TaskBoardModel {
  scope: TaskBoardScope;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  columnTasks: readonly TaskDto[];
  query: TaskQuery;
  onTaskOpen: (taskId: string) => void;
  onTaskEdit: (taskId: string) => void;
  onTaskMenu: (taskId: string, anchor: HTMLElement, point?: OverlayPoint) => void;
}
export interface TaskBoardUiState { collapsedStatuses?: readonly TaskDto['status'][]; composerStatus?: TaskDto['status'] | null }
export interface TaskBoardDropIntent { status: TaskDto['status']; beforeId: TaskDto['id'] | null; afterId: TaskDto['id'] | null }
