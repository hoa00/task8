import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useImperativeHandle, useRef, useState } from 'react';

import type { DragEvent } from 'react';
import type { ToastMessage } from '@studio/ui';
import { TaskScopeQuerySchema } from '@studio/contracts/api';
import type { OperationInput, TaskDto } from '@studio/contracts/api';
import { taskColumns } from './task-view.ts';

import { TaskListRow } from './TaskListRow';

import { useTaskListCommands } from './useTaskListCommands';
import type { ListGroup } from './list-types';
import { TaskListView } from './TaskListView';
import type { TaskListProps } from './TaskListView';
export type { TaskListComposerHandle, TaskListProps, TaskGroupHeaderProps } from './TaskListView';
function useTaskListModel({ model, columns, initialState, ref }: TaskListProps) {
  useTranslation();
  const commands = useTaskListCommands(model.data.workspace.id),
    [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
      Object.fromEntries((initialState?.collapsedGroupKeys ?? []).map((key) => [key, true])),
    ),
    [expanded, setExpanded] = useState<readonly string[]>(initialState?.expandedTaskIds ?? []),
    [composer, setComposer] = useState<string | null>(initialState?.composerGroupKey ?? null),
    [draft, setDraft] = useState(''),
    [confirm, setConfirm] = useState(false),
    [toasts, setToasts] = useState<ToastMessage[]>([]),
    [drop, setDrop] = useState<{ group: string; id: string; position: 'before' | 'after' } | null>(
      null,
    );
  const dragged = useRef<TaskDto | null>(null),
    requestId = useRef(crypto.randomUUID());
  const ids = [...new Set(model.groups.flatMap((group) => group.taskIds))],
    selected = model.selection.selectedIds.filter((id) => ids.includes(id as TaskDto['id']));
  const template = `18px 30px minmax(220px,1fr) ${columns
    .map((id) =>
      (() => {
        const column = taskColumns.find((column) => column.id === id)!;
        return 'listWidth' in column ? column.listWidth : column.width;
      })(),
    )
    .join(' ')} 40px`.replace(/\b(126|150|108|104|168|160)\b/g, '$1px');
  function toast(message: string, action?: ToastMessage['action']) {
    setToasts((current) => [
      { id: crypto.randomUUID(), message, ...(action ? { duration: 0, action } : {}) },
      ...current,
    ]);
  }
  const firstGroup: ListGroup = model.groups[0] ?? { key: 'all', name: 'Tasks', taskIds: [] };
  function start(group: ListGroup) {
    setCollapsed((current) => ({ ...current, [group.key]: false }));
    setComposer(group.key);
    setDraft('');
    requestId.current = crypto.randomUUID();
  }
  useImperativeHandle(ref, () => ({ begin: () => start(firstGroup) }));
  async function create(group: ListGroup) {
    if (commands.pending) return;
    if (!draft.trim()) {
      setComposer(null);
      return;
    }
    const projectId =
      group.patch?.projectId ??
      (model.scope.kind === 'project' || model.scope.kind === 'saved'
        ? model.scope.projectId
        : model.data.projects.find((item) => item.access === 'allowed')?.project.id);
    if (!projectId) return;
    const result = await commands.run('createTask', {
      workspaceId: model.data.workspace.id,
      body: {
        clientRequestId: requestId.current,
        title: draft.trim(),
        projectId,
        ...group.patch,
        ...group.createPatch,
        ...(model.scope.kind === 'mine' ? { assigneeId: model.data.currentMember.id } : {}),
      },
    });
    if (result) {
      setDraft('');
      requestId.current = crypto.randomUUID();
      toast(t('Created {{name}}', { name: result.data.task.key }));
    }
  }
  async function complete(task: TaskDto) {
    const result = await commands.run('setTaskCompletion', {
      workspaceId: task.workspaceId,
      taskId: task.id,
      body: { expectedVersion: task.version, completed: task.status !== 'done' },
    });
    if (result?.data.undo) {
      const undo = result.data.undo;
      toast(t('Completed “{{name}}”', { name: task.title }), {
        label: t('Undo'),
        onAction: () => {
          void commands.undo(undo);
        },
      });
    }
  }
  const items = () =>
    selected.map((id) => {
      const task = model.tasks.find((task) => task.id === id)!;
      return { id: task.id, expectedVersion: task.version };
    });
  async function bulk(body: OperationInput<'bulkMutateTasks'>['body']) {
    const result = await commands.run('bulkMutateTasks', {
      workspaceId: model.data.workspace.id,
      body,
    });
    if (!result) return false;
    if (result.data.undo) {
      const undo = result.data.undo;
      model.selection.onChange([]);
      toast(t('Deleted {{count}} tasks', { count: result.data.tasks.length }), {
        label: t('Undo'),
        onAction: () => {
          void commands.undo(undo);
        },
      });
    } else toast(t('Updated {{count}} tasks', { count: result.data.tasks.length }));
    return true;
  }
  async function move(event: DragEvent, group: ListGroup) {
    event.preventDefault();
    const task = dragged.current,
      destination = drop;
    dragged.current = null;
    setDrop(null);
    if (!task || !destination || destination.id === task.id) return;
    const rows = model.tasks
        .filter((row) => group.taskIds.includes(row.id) && row.id !== task.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      index = rows.findIndex((row) => row.id === destination.id),
      target = rows[index];
    if (!target) return;
    const beforeId = destination.position === 'before' ? target.id : (rows[index + 1]?.id ?? null),
      afterId = destination.position === 'after' ? target.id : (rows[index - 1]?.id ?? null);
    const scope = TaskScopeQuerySchema.parse(
        Object.fromEntries(
          Object.entries(model.view.query).filter(([key]) => !['cursor', 'limit'].includes(key)),
        ),
      ),
      { projectId, ...groupPatch } = group.patch ?? {};
    const result = await commands.run('moveTask', {
      workspaceId: task.workspaceId,
      taskId: task.id,
      body: {
        expectedVersion: task.version,
        scope: {
          ...scope,
          sortField: 'manual',
          sortDirection: 'asc',
          groupBy: model.view.groupBy,
          groupKey:
            group.key === 'none'
              ? null
              : (group.key as OperationInput<'moveTask'>['body']['scope']['groupKey']),
        },
        beforeId,
        afterId,
        ...(projectId ? { targetProjectId: projectId } : {}),
        ...(Object.keys(groupPatch).length ? { groupPatch } : {}),
      },
    });
    if (result && model.view.query.sortField !== 'manual') {
      model.onViewChange({
        ...model.view,
        query: { ...model.view.query, sortField: 'manual', sortDirection: 'asc' },
      });
      toast(t('Sorted manually to keep your order'));
    }
  }

  return {
    ids,
    model,
    start,
    firstGroup,
    composer,
    draft,
    setDraft,
    create,
    setComposer,
    pending: commands.pending,
    error: commands.error,
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
  };
}
export type TaskListRenderState = ReturnType<typeof useTaskListModel>;
export function TaskList(props: TaskListProps) {
  return <TaskListView state={useTaskListModel(props)} />;
}
