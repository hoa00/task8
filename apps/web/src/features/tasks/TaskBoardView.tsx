import { useTranslation } from '../../i18n/useTranslation';
import type { TaskBoardRenderState } from './TaskBoard';
import { translate as t } from '../../i18n/i18n';

import { Fragment } from 'react';
import type { Ref } from 'react';
import { Alert, Icon, Menu, MenuItem, ToastViewport } from '@studio/ui';

import { taskStatuses } from '@studio/contracts/api';

import { TaskBoardColumn, TaskCardComposer } from './TaskBoardColumn';

import type { TaskBoardModel, TaskBoardUiState } from './board-types';
export interface TaskBoardComposerHandle {
  begin(): void;
}
export interface TaskBoardProps {
  model: TaskBoardModel;
  initialState?: TaskBoardUiState | undefined;
  ref?: Ref<TaskBoardComposerHandle>;
}
export function TaskBoardView({ state }: { state: TaskBoardRenderState }) {
  useTranslation();
  const {
    model,
    setDrop,
    collapsed,
    drop,
    setCollapsed,
    start,
    setMenu,
    over,
    move,
    TaskBoardCard,
    dragging,
    effect,
    pending,
    error,
    complete,
    suppressClick,
    setEffect,
    dragged,
    dragTimer,
    setDragging,
    end,
    composer,
    draft,
    setDraft,
    create,
    submitted,
    setComposer,
    menu,
    column,
    toasts,
    setToasts,
  } = state;
  return (
    <>
      <div
        className="task-board"
        aria-label={t('Task board')}
        data-board-scope={model.scope.kind}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
        }}
      >
        {taskStatuses.map((status) => {
          const tasks = model.tasks
            .filter((task) => task.status === status.id)
            .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
          return (
            <TaskBoardColumn
              key={status.id}
              status={status.id}
              name={status.name}
              count={tasks.length}
              collapsed={collapsed.includes(status.id)}
              over={drop?.status === status.id}
              onExpand={() =>
                setCollapsed((current) => current.filter((value) => value !== status.id))
              }
              onAdd={() => start(status.id)}
              onMenu={(anchor, point) =>
                setMenu({ status: status.id, anchor, ...(point ? { point } : {}) })
              }
              onDragOver={(event) => over(event, status.id)}
              onDrop={(event) => {
                void move(event, status.id);
              }}
            >
              {tasks.map((task) => (
                <Fragment key={task.id}>
                  {drop?.status === status.id && drop.beforeId === task.id && (
                    <div className="task-board-drop-line" />
                  )}
                  <TaskBoardCard
                    task={task}
                    model={model}
                    dragging={dragging === task.id}
                    effect={effect?.id === task.id ? effect.kind : undefined}
                    disabled={pending}
                    onComplete={(task) => {
                      void complete(task);
                    }}
                    onOpen={(taskId) => {
                      if (!suppressClick.current) model.onTaskOpen(taskId);
                    }}
                    onEffectEnd={() =>
                      setEffect((current) => (current?.id === task.id ? null : current))
                    }
                    onDragStart={(event, task) => {
                      dragged.current = task;
                      setMenu(null);
                      event.dataTransfer.setData('text/plain', task.id);
                      event.dataTransfer.effectAllowed = 'move';
                      dragTimer.current = setTimeout(() => {
                        dragTimer.current = null;
                        setDragging(task.id);
                      }, 0);
                    }}
                    onDragEnd={end}
                  />
                </Fragment>
              ))}
              {drop?.status === status.id && !drop.beforeId && (
                <div className="task-board-drop-line" />
              )}
              {composer === status.id ? (
                <TaskCardComposer
                  draft={draft}
                  pending={pending}
                  onDraftChange={setDraft}
                  onCommit={() => {
                    void create(status.id);
                  }}
                  onCancel={() => {
                    if (!submitted.current && !pending) setComposer(null);
                  }}
                />
              ) : (
                <button className="task-board-add-card" onClick={() => start(status.id)}>
                  <Icon name="plus" size={14} />
                  {t('Add task')}
                </button>
              )}
            </TaskBoardColumn>
          );
        })}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Menu
        label={t('Column options')}
        open={!!menu}
        anchor={{ current: menu?.anchor ?? null }}
        {...(menu?.point ? { point: menu.point } : {})}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        {menu && (
          <>
            <div className="task-board-menu-heading">
              {t(taskStatuses.find((row) => row.id === menu.status)!.name)}
            </div>
            <MenuItem icon={<Icon name="plus" size={15} />} onSelect={() => start(menu.status)}>
              {t('Add task')}
            </MenuItem>
            <MenuItem
              icon={<Icon name="fold-horizontal" size={15} />}
              onSelect={() => {
                setCollapsed((current) => [...current, menu.status]);
                setMenu(null);
              }}
            >
              {t('Collapse column')}
            </MenuItem>
            {menu.status === 'done' ? (
              <MenuItem
                icon={<Icon name="archive" size={15} />}
                onSelect={() => {
                  void column(menu.status, 'archive');
                }}
              >
                {t('Archive completed')}
              </MenuItem>
            ) : (
              <MenuItem
                icon={<Icon name="check-check" size={15} />}
                onSelect={() => {
                  void column(menu.status, 'complete');
                }}
              >
                {t('Mark all as done')}
              </MenuItem>
            )}
            <MenuItem
              icon={<Icon name="arrow-down-wide-narrow" size={15} />}
              onSelect={() => {
                void column(menu.status, 'sortPriority');
              }}
            >
              {t('Sort by priority')}
            </MenuItem>
          </>
        )}
      </Menu>
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </>
  );
}
