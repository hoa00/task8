import { useDataRuntime } from '../../data/context';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import { useTaskListCommands } from './useTaskListCommands';
import { TaskListRowView } from './TaskListRowView';
import { TaskSubrows } from './TaskSubrows';
import type { TaskListRowProps } from './TaskListRowView';
export type { TaskListRowProps } from './TaskListRowView';
export function TaskListRow(props: TaskListRowProps) {
  const { clock } = useDataRuntime(),
    commands = useTaskFieldCommands(props.task),
    text = useTaskListCommands(props.task.workspaceId);
  return (
    <TaskListRowView
      {...props}
      today={clock.today()}
      commands={commands}
      textPending={text.pending}
      textError={text.error}
      onRename={async (title) =>
        !!(await text.run('updateTask', {
          workspaceId: props.task.workspaceId,
          taskId: props.task.id,
          body: { expectedVersion: props.task.version, title },
        }))
      }
      subrows={props.expanded ? <TaskSubrows task={props.task} /> : null}
    />
  );
}
