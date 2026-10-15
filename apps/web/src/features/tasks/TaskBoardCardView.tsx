import type { DateOnly } from '@studio/contracts/api';
import type { TaskFieldCommandModel } from './field-types';
import { taskDatePatch } from './date-patch';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useState } from 'react';
import type { DragEvent } from 'react';
import { Icon, IconButton, Progress } from '@studio/ui';
import type { TaskDto } from '@studio/contracts/api';
import { priorities } from '@studio/contracts/api';
import { AssigneeField, TaskDateField, TaskPriorityField } from './fields';
import { PriorityIcon, TaskLabel, TaskStatusIcon } from './atoms';
import { MemberIdentity } from '../people/MemberIdentity';
import { formatTaskDate } from './date-display';
import type { TaskBoardModel } from './board-types';
export interface TaskBoardCardProps {
  task: TaskDto;
  model: TaskBoardModel;
  dragging: boolean;
  effect?: 'added' | 'moved' | 'done' | undefined;
  disabled: boolean;
  onComplete: (task: TaskDto) => void;
  onOpen: (taskId: string) => void;
  onDragStart: (event: DragEvent, task: TaskDto) => void;
  onDragEnd: () => void;
  onEffectEnd: () => void;
}
export interface TaskBoardCardViewProps extends TaskBoardCardProps {
  today: DateOnly;
  commands: TaskFieldCommandModel;
}
export function TaskBoardCardView({
  today,
  commands,
  task,
  model,
  dragging,
  effect,
  disabled,
  onComplete,
  onOpen,
  onDragStart,
  onDragEnd,
  onEffectEnd,
}: TaskBoardCardViewProps) {
  useTranslation();
  const [open, setOpen] = useState<'priority' | 'due' | 'assignee' | null>(null);
  const value = { ...task, ...commands.attempt },
    member = model.data.members.find((member) => member.id === value.assigneeId) ?? null,
    project = model.data.projects.find((item) => item.project.id === task.projectId)?.project;
  const priority = priorities.find((row) => row.id === value.priority)!,
    overdue = task.status !== 'done' && !!value.dueDate && value.dueDate < today;
  const control = (field: typeof open) => ({
    open: open === field,
    onOpenChange: (next: boolean) => setOpen(next ? field : null),
    disabled: disabled || commands.pending,
    error: commands.error,
    triggerClassName: 'task-card-meta-item',
  });
  return (
    <div
      className={`task-board-card ${task.status === 'done' ? 'task-card-done' : ''} ${dragging ? 'task-card-dragging' : ''} ${effect ? `task-card-${effect === 'done' ? 'done-effect' : effect}` : ''}`}
      draggable={!disabled && !commands.pending}
      data-task-card={task.id}
      data-task-key={task.key}
      role="button"
      tabIndex={0}
      aria-label={task.title}
      onClick={(event) => {
        if ((event.target as Element).closest('button,[data-overlay-kind]')) return;
        event.currentTarget.focus({ preventScroll: true });
        onOpen(task.id);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          onOpen(task.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        model.onTaskMenu(task.id, event.currentTarget, { x: event.clientX, y: event.clientY });
      }}
      onDragStart={(event) => {
        if ((event.target as Element).closest('button,[data-overlay-kind]')) {
          event.preventDefault();
          return;
        }
        setOpen(null);
        onDragStart(event, task);
      }}
      onDragEnd={onDragEnd}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onEffectEnd();
      }}
    >
      {task.labelIds.length > 0 && (
        <div className="task-card-labels">
          {task.labelIds.map((id) => (
            <TaskLabel key={id} id={id} />
          ))}
        </div>
      )}
      <div className="task-card-top">
        {task.status === 'done' && (
          <span className="task-card-done-icon" aria-label={t('Done')}>
            <TaskStatusIcon status="done" size={14} />
          </span>
        )}
        <div className="task-card-title">{task.title}</div>
      </div>
      {task.subtaskSummary.total > 0 && (
        <div className="task-card-subtasks">
          <Icon name="list-checks" size={12} />
          <span className="tabular-nums">
            {task.subtaskSummary.completed}
            {'/'}
            {task.subtaskSummary.total}
          </span>
          <Progress
            label={t('Subtask progress')}
            value={Math.round((task.subtaskSummary.completed / task.subtaskSummary.total) * 100)}
            tone={task.subtaskSummary.completed === task.subtaskSummary.total ? 'green' : 'accent'}
          />
        </div>
      )}
      <div className="task-card-meta">
        {model.scope.kind === 'workspace' && (
          <span className="task-card-meta-item" title={project?.name}>
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ background: project?.color }}
            />
          </span>
        )}
        <span className="task-card-key">{task.key}</span>
        <TaskPriorityField
          {...control('priority')}
          value={value.priority}
          triggerLabel={t('Priority: {{value1}}', { value1: String(priority.name) })}
          trigger={<PriorityIcon priority={value.priority} size={13} />}
          onChange={(priority) => commands.patch({ priority })}
        />
        {value.dueDate && (
          <TaskDateField
            {...control('due')}
            value={value.dueDate}
            field="dueDate"
            today={today}
            weekStart={model.data.preferences.weekStart}
            overdue={overdue}
            trigger={
              <span
                className={`task-card-due ${overdue ? 'text-red' : task.status !== 'done' && value.dueDate <= new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10) ? 'text-amber' : ''}`}
              >
                <Icon name="calendar" size={12} />
                {formatTaskDate(value.dueDate, today)}
              </span>
            }
            onChange={(dueDate) =>
              commands.patch(taskDatePatch(value, 'dueDate', dueDate, 'record'))
            }
          />
        )}
        {task.recurrence && (
          <span
            className="task-card-meta-item"
            title={t('Repeats {{value1}}', { value1: String(task.recurrence) })}
          >
            <Icon name="repeat" size={12} />
          </span>
        )}
        {task.commentCount > 0 && (
          <span
            className="task-card-meta-item"
            aria-label={t('{{value1}} comments', { value1: String(task.commentCount) })}
          >
            <Icon name="message-square" size={12} />
            {task.commentCount}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span
            className="task-card-meta-item"
            aria-label={t('{{value1}} attachments', { value1: String(task.attachmentCount) })}
          >
            <Icon name="paperclip" size={12} />
            {task.attachmentCount}
          </span>
        )}
        <span className="ml-auto inline-flex">
          <AssigneeField
            {...control('assignee')}
            value={value.assigneeId}
            members={model.data.members}
            currentMemberId={model.data.currentMember.id}
            trigger={<MemberIdentity member={member} avatarOnly />}
            onChange={(assigneeId) => commands.patch({ assigneeId })}
          />
        </span>
      </div>
      <div className="task-card-actions">
        <IconButton
          size="xs"
          disabled={disabled}
          aria-label={task.status === 'done' ? t('Reopen') : t('Mark complete')}
          onClick={() => onComplete(task)}
        >
          <Icon name={task.status === 'done' ? 'rotate-ccw' : 'check'} size={13} />
        </IconButton>
        <IconButton
          size="xs"
          aria-label={t('Quick edit')}
          onClick={() => model.onTaskEdit(task.id)}
        >
          <Icon name="pencil" size={12} />
        </IconButton>
        <IconButton
          size="xs"
          aria-label={t('More')}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            model.onTaskMenu(task.id, event.currentTarget, { x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <Icon name="ellipsis" size={13} />
        </IconButton>
      </div>
      {commands.error && (
        <p className="m-0 text-xs text-red" role="alert">
          {commands.error}
        </p>
      )}
    </div>
  );
}
