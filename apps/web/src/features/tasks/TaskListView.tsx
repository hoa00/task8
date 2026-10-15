import type { TaskListRenderState } from './TaskList';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';

import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Icon,
  IconButton,
  ToastViewport,
} from '@studio/ui';
import type { DragEvent, Ref } from 'react';

import type { TaskDto } from '@studio/contracts/api';
import { taskColumns } from './task-view.ts';
import { TaskStatusIcon, PriorityIcon } from './atoms';
import { MemberIdentity } from '../people/MemberIdentity';

import { BulkActionBar } from './BulkActionBar';

import type { ListColumnId, ListGroup, TaskListModel, TaskListUiState } from './list-types';
export interface TaskListComposerHandle {
  begin(): void;
}
export interface TaskListProps {
  model: TaskListModel;
  columns: readonly ListColumnId[];
  initialState?: TaskListUiState | undefined;
  ref?: Ref<TaskListComposerHandle>;
}
export interface TaskGroupHeaderProps {
  group: ListGroup;
  model: TaskListModel;
  collapsed: boolean;
  onCollapse: () => void;
  onAdd: () => void;
}
export function TaskGroupHeader({
  group,
  model,
  collapsed,
  onCollapse,
  onAdd,
}: TaskGroupHeaderProps) {
  useTranslation();
  const member = model.data.members.find((member) => member.id === group.key),
    project = model.data.projects.find((item) => item.project.id === group.key)?.project;
  return (
    <div className="task-group">
      <IconButton
        size="xs"
        aria-label={t('Toggle {{value1}} group', { value1: String(group.name) })}
        aria-expanded={!collapsed}
        onClick={onCollapse}
      >
        <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} />
      </IconButton>
      {model.scope.kind === 'mine' ? (
        <span
          style={{
            color:
              group.key === 'overdue'
                ? 'var(--red)'
                : group.key === 'completed'
                  ? 'var(--green)'
                  : undefined,
          }}
        >
          <Icon
            name={
              group.key === 'overdue'
                ? 'clock-alert'
                : group.key === 'today'
                  ? 'sun'
                  : group.key === 'completed'
                    ? 'circle-check'
                    : 'calendar-days'
            }
            size={14}
          />
        </span>
      ) : model.view.groupBy === 'status' ? (
        <TaskStatusIcon status={group.key as TaskDto['status']} />
      ) : model.view.groupBy === 'priority' ? (
        <PriorityIcon priority={group.key as TaskDto['priority']} />
      ) : model.view.groupBy === 'assignee' ? (
        <MemberIdentity member={member ?? null} avatarOnly />
      ) : model.view.groupBy === 'project' ? (
        <span className="size-2 shrink-0 rounded-[3px]" style={{ background: project?.color }} />
      ) : model.view.groupBy === 'due' ? (
        <Icon name="calendar" size={14} />
      ) : null}
      <span>
        {model.view.groupBy === 'project' ||
        (model.view.groupBy === 'assignee' && group.key !== 'none')
          ? group.name
          : t(group.name)}
      </span>
      <span className="task-group-count">{group.taskIds.length}</span>
      <IconButton
        size="xs"
        aria-label={t('Add task to {{value1}}', { value1: String(group.name) })}
        onClick={onAdd}
      >
        <Icon name="plus" size={13} />
      </IconButton>
    </div>
  );
}
export function TaskListView({ state }: { state: TaskListRenderState }) {
  useTranslation();
  const {
    ids,
    model,
    start,
    firstGroup,
    composer,
    draft,
    setDraft,
    create,
    setComposer,
    pending,
    error,
    template,
    selected,
    columns,
    collapsed,
    setCollapsed,
    TaskListRow,
    expanded,
    setExpanded,
    complete,
    dragged,
    setDrop,
    move,
    drop,
    bulk,
    items,
    setConfirm,
    confirm,
    toasts,
    setToasts,
  } = state;
  if (!ids.length && model.scope.kind !== 'mine')
    return (
      <>
        <EmptyState
          icon="list-checks"
          heading={t('No tasks here')}
          description={t('Add a task to get things moving.')}
          action={
            <Button
              size="sm"
              variant="primary"
              disabled={!model.data.projects.some((item) => item.access === 'allowed')}
              onClick={() => start(firstGroup)}
            >
              <Icon name="plus" size={14} />
              {t('New task')}
            </Button>
          }
        />
        {composer && (
          <input
            autoFocus
            className="task-inline-input max-w-[360px]"
            aria-label={t('New task name')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create(firstGroup);
              if (event.key === 'Escape') setComposer(null);
            }}
          />
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </>
    );
  return (
    <>
      <div className="task-list" role="table" aria-label={t('Tasks')}>
        <div className="task-list-head" style={{ gridTemplateColumns: template }} role="row">
          <div />
          <div>
            {model.selection.kind === 'bulk' && (
              <Checkbox
                aria-label={t('Select all')}
                checked={selected.length > 0 && selected.length === ids.length}
                indeterminate={selected.length > 0 && selected.length < ids.length}
                onCheckedChange={() =>
                  model.selection.onChange(selected.length === ids.length ? [] : ids)
                }
              />
            )}
          </div>
          {(['title', ...columns] as const).map((id) => (
            <div
              key={id}
              onClick={() => {
                const field = id === 'labels' ? 'manual' : id;
                model.onViewChange({
                  ...model.view,
                  query: {
                    ...model.view.query,
                    sortField: field,
                    sortDirection:
                      model.view.query.sortField === field &&
                      model.view.query.sortDirection === 'asc'
                        ? 'desc'
                        : 'asc',
                  },
                });
              }}
              className="cursor-pointer"
            >
              {t(taskColumns.find((column) => column.id === id)!.name)}
              {model.view.query.sortField === id && (
                <Icon
                  name={model.view.query.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                  size={11}
                />
              )}
            </div>
          ))}
          <div />
        </div>
        {model.groups.map((group) => {
          const hide = collapsed[group.key] ?? group.collapsed ?? false;
          return (
            <section key={group.key} data-task-group={group.key}>
              {(model.groups.length > 1 || group.key !== 'all') && (
                <TaskGroupHeader
                  group={group}
                  model={model}
                  collapsed={hide}
                  onCollapse={() => setCollapsed((current) => ({ ...current, [group.key]: !hide }))}
                  onAdd={() => start(group)}
                />
              )}
              {!hide && (
                <>
                  {group.taskIds.map((id) => {
                    const task = model.tasks.find((task) => task.id === id)!;
                    return (
                      <TaskListRow
                        key={id}
                        task={task}
                        model={model}
                        columns={columns}
                        template={template}
                        expanded={expanded.includes(id)}
                        onExpand={() =>
                          setExpanded((current) =>
                            current.includes(id)
                              ? current.filter((value) => value !== id)
                              : [...current, id],
                          )
                        }
                        onComplete={(task) => {
                          void complete(task);
                        }}
                        {...(model.scope.kind !== 'mine'
                          ? {
                              onDragStart: (event: DragEvent, task: TaskDto) => {
                                dragged.current = task;
                                event.dataTransfer.setData('text/plain', task.id);
                                event.dataTransfer.effectAllowed = 'move';
                              },
                              onDragOver: (event: DragEvent) => {
                                if (!dragged.current || dragged.current.id === id) return;
                                event.preventDefault();
                                const rect = event.currentTarget.getBoundingClientRect();
                                setDrop({
                                  group: group.key,
                                  id,
                                  position:
                                    event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
                                });
                              },
                              onDrop: (event: DragEvent) => {
                                void move(event, group);
                              },
                            }
                          : {})}
                        onDragEnd={() => {
                          dragged.current = null;
                          setDrop(null);
                        }}
                        drop={
                          drop?.group === group.key && drop.id === id ? drop.position : undefined
                        }
                      />
                    );
                  })}
                  {composer === group.key ? (
                    <div className="task-add-row bg-surface-2">
                      <Icon name="plus" size={14} />
                      <input
                        autoFocus
                        className="task-inline-input"
                        aria-label={t('New task name')}
                        placeholder={t('Task name — press Enter to add, Esc to cancel')}
                        value={draft}
                        aria-busy={pending}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void create(group);
                          }
                          if (event.key === 'Escape') setComposer(null);
                        }}
                      />
                    </div>
                  ) : (
                    <button className="task-add-row" onClick={() => start(group)}>
                      <Icon name="plus" size={14} />
                      {t('Add task')}
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {model.selection.kind === 'bulk' && selected.length > 0 && (
        <BulkActionBar
          count={selected.length}
          data={model.data}
          pending={pending}
          onPatch={(patch) => bulk({ operation: 'patch', items: items(), patch })}
          onDelete={() => setConfirm(true)}
          onClear={() => model.selection.onChange([])}
        />
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        aria-label={t('Delete {{count}} task?', { count: selected.length })}
      >
        <DialogHeader
          titleId="task-delete-title"
          onClose={() => setConfirm(false)}
          title={t('Delete {{count}} task?', { count: selected.length })}
        />
        <DialogBody>
          {t('The selected tasks, their subtasks, and comments will be permanently deleted.')}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => setConfirm(false)}>{t('Cancel')}</Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={async () => {
              if (await bulk({ operation: 'delete', items: items() })) setConfirm(false);
            }}
          >
            {t('Delete')} {selected.length}
            {'  '}
            {t('task')}
            {selected.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </Dialog>
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
    </>
  );
}
