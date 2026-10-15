import { TaskTableView } from './TaskTableView';
import type { TaskTableProps } from './TaskTableView';
import { TaskTableRow, TaskTableMobileCard } from './TaskTableCell';
export type { TaskTableProps, TaskTableHeaderProps } from './TaskTableView';
export { TaskTableHeader } from './TaskTableView';
export function TaskTable(props: TaskTableProps) {
  return (
    <TaskTableView
      {...props}
      TaskTableRow={TaskTableRow}
      TaskTableMobileCard={TaskTableMobileCard}
    />
  );
}
