import { useDataRuntime } from '../../data/context';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import { TaskBoardCardView } from './TaskBoardCardView';
import type { TaskBoardCardProps } from './TaskBoardCardView';
export type { TaskBoardCardProps } from './TaskBoardCardView';
export function TaskBoardCard(props: TaskBoardCardProps) {
  const { clock } = useDataRuntime();
  const commands = useTaskFieldCommands(props.task);
  return <TaskBoardCardView {...props} today={clock.today()} commands={commands} />;
}
