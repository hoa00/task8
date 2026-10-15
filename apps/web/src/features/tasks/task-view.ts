import { normalizeTaskEvaluation } from '@studio/domain';
import type { TaskGroupBy } from '@studio/domain';
import type { TaskQuery } from '@studio/contracts/api';
// Web presentation preferences; semantic task rules remain in @studio/domain.
export const taskColumns = [
  { id: 'title', name: 'Task', width: 314 },
  { id: 'status', name: 'Status', width: 132, listWidth: 126 },
  { id: 'priority', name: 'Priority', width: 112, listWidth: 108 },
  { id: 'assignee', name: 'Assignee', width: 156, listWidth: 150 },
  { id: 'due', name: 'Due date', width: 112, listWidth: 104 },
  { id: 'start', name: 'Start date', width: 112 },
  { id: 'labels', name: 'Labels', width: 180, listWidth: 168 },
  { id: 'deps', name: 'Dependencies', width: 150 },
  { id: 'estimate', name: 'Estimate', width: 92 },
  { id: 'created', name: 'Created', width: 112 },
  { id: 'project', name: 'Project', width: 156, listWidth: 160 },
] as const;
export type TaskColumnId = (typeof taskColumns)[number]['id'];
export interface TaskViewState {
  query: TaskQuery;
  groupBy: TaskGroupBy;
  hiddenColumns: readonly TaskColumnId[];
  columnWidths: Readonly<Partial<Record<TaskColumnId, number>>>;
}
export function normalizeTaskView(
  input: {
    query?: unknown;
    groupBy?: unknown;
    hiddenColumns?: readonly string[];
    columnWidths?: Readonly<Record<string, number>>;
  } = {},
): TaskViewState {
  const hidden = input.hiddenColumns ?? ['start', 'created', 'deps'];
  if (hidden.some((id) => !taskColumns.some((column) => column.id === id) || id === 'title'))
    throw new TypeError('Invalid hidden column');
  const widths = input.columnWidths ?? {};
  if (
    Object.entries(widths).some(
      ([id, width]) =>
        !taskColumns.some((column) => column.id === id) || !Number.isFinite(width) || width < 64,
    )
  )
    throw new TypeError('Invalid column width');
  return {
    ...normalizeTaskEvaluation(input),
    hiddenColumns: [...new Set(hidden)] as TaskColumnId[],
    columnWidths: { ...widths },
  };
}
