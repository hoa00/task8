import { useDataRuntime } from '../../data/context';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import { useTaskListCommands } from './useTaskListCommands';
import { TaskTableRowView, TaskTableMobileCardView } from './TaskTableCellView';
import type { TaskTableRowProps, TaskTableMobileCardProps } from './TaskTableCellView';
export type { TaskTableRowProps, TaskTableMobileCardProps } from './TaskTableCellView';
export function TaskTableRow(props: TaskTableRowProps) {
  const { clock } = useDataRuntime(),
    commands = useTaskFieldCommands(props.task),
    text = useTaskListCommands(props.task.workspaceId);
  return (
    <TaskTableRowView
      {...props}
      today={clock.today()}
      commands={commands}
      textCommands={{
        pending: text.pending,
        error: text.error,
        clearError: text.clearError,
        update: async (patch) =>
          !!(await text.run('updateTask', {
            workspaceId: props.task.workspaceId,
            taskId: props.task.id,
            body: patch,
          })),
      }}
    />
  );
}
export function TaskTableMobileCard(props: TaskTableMobileCardProps) {
  const { clock } = useDataRuntime();
  return <TaskTableMobileCardView {...props} today={clock.today()} />;
}
