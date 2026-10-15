import { taskFieldPatch } from '../date-patch';
import { translate as t, locale } from '../../../i18n/i18n';
import { useTranslation } from '../../../i18n/useTranslation';
import { Fragment } from 'react';
import { ColorDot, Icon } from '@studio/ui';
import type { IconName } from '@studio/ui';
import type { BootstrapDto, TaskDto, DateOnly } from '@studio/contracts/api';
import { recurrences } from '@studio/contracts/api';
import {
  AssigneeField,
  TaskDateField,
  TaskDependenciesField,
  TaskEstimateField,
  TaskLabelsField,
  TaskPriorityField,
  TaskProjectField,
  TaskRecurrenceField,
  TaskStatusField,
} from '../fields';
import { TaskLabel } from '../atoms';
import { MemberIdentity } from '../../people/MemberIdentity';
import type { TaskFieldValues, TaskFieldPatch } from '../field-types';
export interface TaskPropertyGridProps {
  today: DateOnly;
  value: TaskFieldValues;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  onPatch: (patch: TaskFieldPatch) => Promise<boolean> | boolean;
  openField: keyof TaskFieldValues | null;
  onOpenFieldChange: (field: keyof TaskFieldValues | null) => void;
  full?: boolean;
  form?: boolean;
  taskId?: TaskDto['id'];
  disabled?: boolean;
  error?: string;
}
export function TaskPropertyGrid({
  today,
  value,
  data,
  tasks,
  onPatch,
  openField,
  onOpenFieldChange,
  full,
  form,
  taskId,
  disabled,
  error,
}: TaskPropertyGridProps) {
  useTranslation();
  const projects = data.projects
    .filter((item) => item.access === 'allowed')
    .map((item) => item.project);
  function control<K extends keyof TaskFieldValues>(field: K) {
    return {
      value: value[field],
      onChange: (next: TaskFieldValues[K]) =>
        onPatch(taskFieldPatch(value, field, next, taskId ? 'record' : 'draft')),
      open: openField === field,
      onOpenChange: (open: boolean) => onOpenFieldChange(open ? field : null),
      disabled: !!disabled,
      error,
      presentation: form ? ('form-chip' as const) : ('drawer-property' as const),
      ...(form
        ? {
            triggerClassName:
              'inline-flex h-[26px] max-w-full items-center gap-[6px] whitespace-nowrap rounded-sm px-[7px] text-sm text-foreground transition-[background] source-hover:bg-surface-2',
          }
        : {}),
    };
  }
  const project = projects.find((p) => p.id === value.projectId),
    member = data.members.find((m) => m.id === value.assigneeId) ?? null,
    fmt = (date: string) =>
      new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${date}T00:00:00Z`),
      );
  const pill =
    'inline-flex min-h-[26px] max-w-full items-center gap-[6px] whitespace-nowrap rounded-sm px-[7px] text-sm transition-[background] source-hover:bg-surface-2';
  const entries = [
    {
      key: 'status',
      label: t('Status'),
      icon: 'circle-dot',
      field: <TaskStatusField {...control('status')} triggerLabel={t('Status')} />,
    },
    {
      key: 'priority',
      label: t('Priority'),
      icon: 'signal-high',
      field: <TaskPriorityField {...control('priority')} />,
    },
    {
      key: 'assignee',
      label: t('Assignee'),
      icon: 'user',
      field: (
        <AssigneeField
          {...control('assigneeId')}
          members={data.members}
          currentMemberId={data.currentMember.id}
          trigger={
            form ? (
              <>
                <MemberIdentity member={member} avatarOnly className="static!" />
                {member?.name ?? t('Assignee')}
              </>
            ) : (
              <MemberIdentity member={member} className="static!" />
            )
          }
        />
      ),
    },
    {
      key: 'due',
      label: t('Due date'),
      icon: 'calendar',
      field: (
        <TaskDateField
          {...control('dueDate')}
          field="dueDate"
          today={today}
          weekStart={data.preferences.weekStart}
          overdue={value.status !== 'done' && !!value.dueDate && value.dueDate < today}
          {...(form
            ? {
                trigger: (
                  <>
                    <Icon name="calendar" size={13} />
                    {value.dueDate
                      ? t('Due {{date}}', { date: fmt(value.dueDate) })
                      : t('Due date')}
                  </>
                ),
              }
            : {})}
        />
      ),
    },
    {
      key: 'start',
      label: t('Start date'),
      icon: 'calendar-arrow-up',
      field: (
        <TaskDateField
          {...control('startDate')}
          field="startDate"
          today={today}
          weekStart={data.preferences.weekStart}
          trigger={
            <>
              <Icon name={form ? 'calendar-arrow-up' : 'calendar'} size={13} />
              {value.startDate
                ? `${form ? t('Starts') : ''}${fmt(value.startDate)}`
                : form
                  ? t('Start date')
                  : t('Set date')}
            </>
          }
        />
      ),
    },
    {
      key: 'project',
      label: t('Project'),
      icon: 'folder',
      field: (
        <TaskProjectField
          {...control('projectId')}
          projects={projects}
          {...(form
            ? {
                trigger: (
                  <>
                    <ColorDot
                      className="size-2! rounded-[3px]!"
                      color={project?.color ?? 'var(--text-3)'}
                    />
                    {project?.name ?? t('Project')}
                  </>
                ),
              }
            : {})}
        />
      ),
    },
    {
      key: 'labels',
      label: t('Labels'),
      icon: 'tag',
      field: (
        <TaskLabelsField
          {...control('labelIds')}
          triggerClassName={`${pill} flex-wrap whitespace-normal ${form ? 'h-[26px] py-0' : 'py-[3px]'} ${form ? 'border border-solid border-border' : ''} ${!value.labelIds.length && !form ? 'text-muted' : 'text-foreground'}`}
          trigger={
            value.labelIds.length ? (
              <>
                {value.labelIds.map((id) => (
                  <TaskLabel key={id} id={id} />
                ))}
              </>
            ) : (
              <>
                <Icon name="tag" size={13} />
                {form ? t('Labels') : t('Add labels')}
              </>
            )
          }
        />
      ),
    },
    {
      key: 'repeat',
      label: t('Repeat'),
      icon: 'repeat',
      field: (
        <TaskRecurrenceField
          {...control('recurrence')}
          triggerClassName={`${pill} ${!value.recurrence && !form ? 'text-muted' : ''}`}
          trigger={
            <>
              <Icon name="repeat" size={13} />
              {t(
                recurrences.find((row) => row.id === value.recurrence)?.name ??
                  (form ? 'Repeat' : 'Does not repeat'),
              )}
            </>
          }
        />
      ),
    },
    {
      key: 'estimate',
      label: t('Estimate'),
      icon: 'timer',
      field: (
        <TaskEstimateField
          {...control('estimate')}
          trigger={
            <>
              <Icon name="timer" size={13} />
              {value.estimate ?? t('Add estimate')}
            </>
          }
        />
      ),
    },
    {
      key: 'deps',
      label: t('Blocked by'),
      icon: 'git-branch',
      field: (
        <TaskDependenciesField
          {...control('dependencyIds')}
          tasks={tasks}
          projectId={value.projectId}
          {...(taskId ? { taskId } : {})}
          triggerClassName={`${pill} flex-wrap whitespace-normal ${!value.dependencyIds.length ? 'text-muted' : ''}`}
          trigger={
            value.dependencyIds.length ? (
              <>
                {value.dependencyIds.map((id) => {
                  const t = tasks.find((row) => row.id === id);
                  return t ? (
                    <Fragment key={id}>
                      <span className="rounded-[4px] bg-surface-3 px-[5px] py-px font-mono text-[11px]">
                        {t.key}
                      </span>
                      <span className="max-w-[160px] truncate">{t.title}</span>
                    </Fragment>
                  ) : null;
                })}
              </>
            ) : (
              <>
                <Icon name="git-branch" size={13} />
                {t('None')}
              </>
            )
          }
        />
      ),
    },
  ];
  if (form)
    return (
      <div className="flex flex-wrap items-center gap-[6px]">
        {['project', 'status', 'assignee', 'priority', 'due', 'start', 'labels', 'repeat'].map(
          (key) => (
            <Fragment key={key}>{entries.find((row) => row.key === key)!.field}</Fragment>
          ),
        )}
      </div>
    );
  return (
    <dl
      className={`task-property-grid mt-3 grid items-center gap-y-[2px] text-sm ${full ? 'grid-cols-[112px_minmax(0,1fr)_112px_minmax(0,1fr)]' : 'grid-cols-[112px_minmax(0,1fr)]'}`}
    >
      {entries.map((row) => (
        <Fragment key={row.key}>
          <dt className="m-0 flex h-[30px] items-center gap-[7px] text-secondary">
            <Icon name={row.icon as IconName} size={14} className="text-faint" />
            {t(row.label)}
          </dt>
          <dd className="m-0 flex min-h-[30px] min-w-0 flex-wrap items-center gap-1">
            {row.field}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
