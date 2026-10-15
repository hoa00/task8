import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import type { TaskDto } from '@studio/contracts/api';
import { Checkbox } from '@studio/ui';
import { useStudioQuery } from '../../data/queries';
import { useTaskListCommands } from './useTaskListCommands';
export function TaskSubrows({ task }: { task: TaskDto }) {
  useTranslation();
  const query = useStudioQuery('getTask', { workspaceId: task.workspaceId, taskId: task.id }),
    commands = useTaskListCommands(task.workspaceId);
  if (!query.data) return <div className="task-subrows">{t('Loading subtasks…')}</div>;
  const detail = query.data.data;
  return (
    <div className="task-subrows">
      {detail.subtasks.map((subtask) => (
        <div key={subtask.id} className={`task-subrow ${subtask.done ? 'task-done' : ''}`}>
          <Checkbox
            checked={subtask.done}
            aria-label={t('Complete subtask {{value1}}', { value1: String(subtask.title) })}
            disabled={commands.pending}
            onCheckedChange={(done) => {
              void commands.run('updateSubtask', {
                workspaceId: task.workspaceId,
                taskId: task.id,
                subtaskId: subtask.id,
                body: { expectedTaskVersion: detail.task.version, done },
              });
            }}
          />
          <span>{subtask.title}</span>
        </div>
      ))}
      {commands.error && (
        <p role="alert" className="m-0 text-xs text-red">
          {commands.error}
        </p>
      )}
    </div>
  );
}
