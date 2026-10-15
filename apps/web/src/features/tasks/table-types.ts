import type { BootstrapDto, TaskDto } from '@studio/contracts/api';
import type { OverlayPoint } from '@studio/ui';
import type { TaskViewState } from './task-view.ts';
import type { ListGroup, TaskListScope } from './list-types';

export interface TaskTableModel {
  scope: Exclude<TaskListScope, { kind: 'mine' }>;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  dependencyTasks: readonly TaskDto[];
  groups: readonly ListGroup[];
  view: TaskViewState;
  onViewChange: (view: TaskViewState) => void;
  onTaskOpen: (taskId: string) => void;
  onTitleEdit: () => void;
  onNewTask: () => void;
  onTaskMenu: (taskId: string, anchor: HTMLElement, point?: OverlayPoint) => void;
}
