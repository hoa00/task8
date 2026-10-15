import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import type { ToastMessage } from '@studio/ui';
import { taskStatuses, TaskScopeQuerySchema } from '@studio/contracts/api';
import type { TaskDto } from '@studio/contracts/api';

import { TaskBoardCard } from './TaskBoardCard';
import { useTaskListCommands } from './useTaskListCommands';
import type { TaskBoardDropIntent } from './board-types';
import { TaskBoardView } from './TaskBoardView';
import type { TaskBoardProps } from './TaskBoardView';
export type { TaskBoardComposerHandle, TaskBoardProps } from './TaskBoardView';
function useTaskBoardModel({ model, initialState, ref }: TaskBoardProps) {
  useTranslation();
  const commands = useTaskListCommands(model.data.workspace.id),
    [collapsed, setCollapsed] = useState<readonly TaskDto['status'][]>(
      initialState?.collapsedStatuses ?? [],
    ),
    [composer, setComposer] = useState<TaskDto['status'] | null>(
      initialState?.composerStatus ?? null,
    ),
    [draft, setDraft] = useState(''),
    [menu, setMenu] = useState<{
      status: TaskDto['status'];
      anchor: HTMLElement;
      point?: { x: number; y: number };
    } | null>(null),
    [drop, setDrop] = useState<TaskBoardDropIntent | null>(null),
    [dragging, setDragging] = useState<string | null>(null),
    [toasts, setToasts] = useState<ToastMessage[]>([]),
    [effect, setEffect] = useState<{ id: string; kind: 'added' | 'moved' | 'done' } | null>(null);
  const dragged = useRef<TaskDto | null>(null),
    requestId = useRef(crypto.randomUUID()),
    suppressClick = useRef(false),
    suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    submitted = useRef(false),
    dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectId =
    model.scope.kind === 'project' || model.scope.kind === 'saved'
      ? model.scope.projectId
      : undefined;
  function toast(message: string, action?: ToastMessage['action']) {
    setToasts((current) => [
      ...current,
      { id: crypto.randomUUID(), message, ...(action ? { duration: 0, action } : {}) },
    ]);
  }
  useEffect(
    () => () => {
      if (dragTimer.current !== null) clearTimeout(dragTimer.current);
      if (suppressTimer.current !== null) clearTimeout(suppressTimer.current);
    },
    [],
  );
  function start(status: TaskDto['status']) {
    if (submitted.current || commands.pending) return;
    setMenu(null);
    setCollapsed((current) => current.filter((value) => value !== status));
    setComposer(status);
    setDraft('');
    requestId.current = crypto.randomUUID();
  }
  useImperativeHandle(ref, () => ({ begin: () => start('backlog') }));
  async function create(status: TaskDto['status']) {
    if (submitted.current || commands.pending) return;
    if (!draft.trim()) {
      setComposer(null);
      return;
    }
    const destination =
      projectId ?? model.data.projects.find((item) => item.access === 'allowed')?.project.id;
    if (!destination) return;
    submitted.current = true;
    try {
      const result = await commands.run('createTask', {
        workspaceId: model.data.workspace.id,
        body: {
          clientRequestId: requestId.current,
          projectId: destination,
          title: draft.trim(),
          status,
        },
      });
      if (result) {
        setDraft('');
        requestId.current = crypto.randomUUID();
        setEffect({ id: result.data.task.id, kind: 'added' });
      }
    } finally {
      submitted.current = false;
    }
  }
  async function complete(task: TaskDto) {
    if (commands.pending) return;
    const result = await commands.run('setTaskCompletion', {
      workspaceId: task.workspaceId,
      taskId: task.id,
      body: { expectedVersion: task.version, completed: task.status !== 'done' },
    });
    if (result?.data.undo) {
      const undo = result.data.undo;
      setEffect({ id: task.id, kind: 'done' });
      toast(t('Completed “{{name}}”', { name: task.title }), {
        label: t('Undo'),
        onAction: () => {
          void commands.undo(undo);
        },
      });
    }
  }
  async function column(
    status: TaskDto['status'],
    operation: 'complete' | 'archive' | 'sortPriority',
  ) {
    setMenu(null);
    if (commands.pending) return;
    const tasks = model.columnTasks.filter((task) => task.status === status),
      columnScope = projectId
        ? { kind: 'project' as const, projectId, status }
        : { kind: 'workspace' as const, status };
    const result = await commands.run('bulkMutateTasks', {
      workspaceId: model.data.workspace.id,
      body: {
        operation,
        columnScope,
        items: tasks.map((task) => ({ id: task.id, expectedVersion: task.version })),
      },
    });
    if (result?.data.undo) {
      const undo = result.data.undo;
      toast(
        operation === 'archive'
          ? t('Archived {{count}} completed tasks', { count: result.data.tasks.length })
          : t('Marked {{count}} tasks as done', { count: result.data.tasks.length }),
        {
          label: t('Undo'),
          onAction: () => {
            void commands.undo(undo);
          },
        },
      );
    }
  }
  function end() {
    if (dragTimer.current !== null) {
      clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
    dragged.current = null;
    setDragging(null);
    setDrop(null);
    suppressClick.current = true;
    if (suppressTimer.current !== null) clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppressClick.current = false;
      suppressTimer.current = null;
    }, 100);
  }
  function over(event: DragEvent, status: TaskDto['status']) {
    if (!dragged.current || commands.pending) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const body = event.currentTarget.querySelector<HTMLElement>('[data-board-body]');
    if (!body) {
      setDrop(null);
      return;
    }
    const cards = body
      ? [...body.querySelectorAll<HTMLElement>('[data-task-card]')].filter(
          (card) => card.dataset.taskCard !== dragged.current!.id,
        )
      : [];
    const next = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      }),
      rows = model.columnTasks
        .filter((task) => task.status === status && task.id !== dragged.current!.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      index = next ? rows.findIndex((row) => row.id === next.dataset.taskCard) : rows.length;
    setDrop({ status, beforeId: rows[index]?.id ?? null, afterId: rows[index - 1]?.id ?? null });
  }
  async function move(event: DragEvent, status: TaskDto['status']) {
    event.preventDefault();
    const task = dragged.current,
      destination = drop;
    end();
    if (
      !event.currentTarget.querySelector('[data-board-body]') ||
      !task ||
      !destination ||
      destination.status !== status ||
      commands.pending
    )
      return;
    const scope = TaskScopeQuerySchema.parse(projectId ? { projectId } : {});
    const result = await commands.run('moveTask', {
      workspaceId: task.workspaceId,
      taskId: task.id,
      body: {
        expectedVersion: task.version,
        scope: {
          ...scope,
          sortField: 'manual',
          sortDirection: 'asc',
          groupBy: 'status',
          groupKey: status,
        },
        beforeId: destination.beforeId,
        afterId: destination.afterId,
        groupPatch: { status },
        ...(projectId ? { targetProjectId: projectId } : {}),
      },
    });
    if (result) {
      setEffect({ id: task.id, kind: 'moved' });
      if (task.status !== status)
        toast(
          t('Moved “{{name}}” to {{status}}', {
            name: task.title,
            status: t(taskStatuses.find((row) => row.id === status)!.name),
          }),
        );
    }
  }

  return {
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
    pending: commands.pending,
    error: commands.error,
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
  };
}
export type TaskBoardRenderState = ReturnType<typeof useTaskBoardModel>;
export function TaskBoard(props: TaskBoardProps) {
  return <TaskBoardView state={useTaskBoardModel(props)} />;
}
