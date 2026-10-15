import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Button, EmptyState, Icon } from '@studio/ui';
import { taskColumns } from './task-view.ts';
import type { TaskColumnId } from './task-view.ts';
import type { TaskDto } from '@studio/contracts/api';
import type { ComponentType } from 'react';
import type { TaskTableRowProps, TaskTableMobileCardProps } from './TaskTableCellView';
import { TaskStatusIcon, PriorityIcon } from './atoms';
import { MemberIdentity } from '../people/MemberIdentity';
import type { TaskTableModel } from './table-types';

export interface TaskTableProps {
  model: TaskTableModel;
}
export interface TaskTableHeaderProps {
  model: TaskTableModel;
  columns: readonly (typeof taskColumns)[number][];
  resizing: TaskColumnId | null;
  onResize: (event: PointerEvent<HTMLElement>, column: TaskColumnId) => void;
  onSort: (column: TaskColumnId) => void;
}
export function TaskTableHeader({
  model,
  columns,
  resizing,
  onResize,
  onSort,
}: TaskTableHeaderProps) {
  useTranslation();
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <th
            key={column.id}
            className={column.id === 'title' ? 'task-table-sticky' : ''}
            scope="col"
            aria-sort={
              model.view.query.sortField === column.id
                ? model.view.query.sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'
            }
          >
            <button className="task-table-heading" onClick={() => onSort(column.id)}>
              {t(column.name)}
              {model.view.query.sortField === column.id && (
                <Icon
                  name={model.view.query.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                  size={11}
                />
              )}
            </button>
            <span
              className={`task-table-resize ${resizing === column.id ? 'task-table-resizing' : ''}`}
              data-table-resize={column.id}
              aria-hidden="true"
              onPointerDown={(event) => onResize(event, column.id)}
            />
          </th>
        ))}
      </tr>
    </thead>
  );
}
export function TaskTableView({
  model,
  TaskTableRow,
  TaskTableMobileCard,
}: TaskTableProps & {
  TaskTableRow: ComponentType<TaskTableRowProps>;
  TaskTableMobileCard: ComponentType<TaskTableMobileCardProps>;
}) {
  useTranslation();
  const [resizing, setResizing] = useState<{
    column: TaskColumnId;
    width: number;
    total: number;
  } | null>(null);
  const table = useRef<HTMLTableElement>(null),
    cleanup = useRef<(() => void) | null>(null),
    suppress = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const columns = taskColumns.filter(
    (column) => column.id === 'title' || !model.view.hiddenColumns.includes(column.id),
  );
  useEffect(
    () => () => {
      cleanup.current?.();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function resize(event: PointerEvent<HTMLElement>, column: TaskColumnId) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const col = table.current?.querySelector<HTMLElement>(`col[data-table-col="${column}"]`);
    if (!col || !table.current) return;
    const startWidth = col.getBoundingClientRect().width,
      startTotal = table.current.getBoundingClientRect().width,
      startX = event.clientX;
    const width = (x: number) => Math.max(64, startWidth + x - startX);
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerId === pointerId)
        setResizing({
          column,
          width: width(event.clientX),
          total: startTotal + width(event.clientX) - startWidth,
        });
    };
    const pointerId = event.pointerId;
    const remove = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cleanup.current = null;
    };
    const cancel = () => {
      remove();
      setResizing(null);
    };
    const up = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      remove();
      setResizing(null);
      suppress.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        suppress.current = false;
        timer.current = null;
      }, 60);
      model.onViewChange({
        ...model.view,
        columnWidths: { ...model.view.columnWidths, [column]: Math.round(width(event.clientX)) },
      });
    };
    cleanup.current = remove;
    setResizing({ column, width: startWidth, total: startTotal });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }
  function sort(column: TaskColumnId) {
    if (suppress.current) return;
    const sortField = column === 'labels' || column === 'deps' ? 'manual' : column;
    model.onViewChange({
      ...model.view,
      query: {
        ...model.view.query,
        sortField,
        sortDirection:
          model.view.query.sortField === sortField && model.view.query.sortDirection === 'asc'
            ? 'desc'
            : 'asc',
      },
    });
  }
  if (!model.tasks.length)
    return (
      <EmptyState
        icon="search-x"
        heading={t('No results found')}
        description={t('No tasks match these filters.')}
        action={
          <Button
            size="sm"
            onClick={() =>
              model.onViewChange({
                ...model.view,
                query: { ...model.view.query, q: '', filters: [] },
              })
            }
          >
            {t('Clear filters')}
          </Button>
        }
      />
    );
  const total =
    resizing?.total ??
    columns.reduce(
      (sum, column) => sum + Math.max(64, model.view.columnWidths[column.id] ?? column.width),
      0,
    );
  function groupIcon(key: string) {
    if (model.view.groupBy === 'status')
      return <TaskStatusIcon status={key as TaskDto['status']} />;
    if (model.view.groupBy === 'priority')
      return <PriorityIcon priority={key as TaskDto['priority']} />;
    if (model.view.groupBy === 'assignee')
      return (
        <MemberIdentity
          member={model.data.members.find((member) => member.id === key) ?? null}
          avatarOnly
        />
      );
    if (model.view.groupBy === 'project')
      return (
        <span
          className="size-2 shrink-0 rounded-[3px]"
          style={{
            background: model.data.projects.find((item) => item.project.id === key)?.project.color,
          }}
        />
      );
    return model.view.groupBy === 'due' ? <Icon name="calendar" size={14} /> : null;
  }
  return (
    <>
      <div className="task-table-wrap" data-table-scope={model.scope.kind}>
        <table
          ref={table}
          className="task-table"
          style={{ width: total }}
          aria-label={t('Tasks table')}
        >
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.id}
                data-table-col={column.id}
                style={{
                  width:
                    resizing?.column === column.id
                      ? resizing.width
                      : Math.max(64, model.view.columnWidths[column.id] ?? column.width),
                }}
              />
            ))}
          </colgroup>
          <TaskTableHeader
            model={model}
            columns={columns}
            resizing={resizing?.column ?? null}
            onResize={resize}
            onSort={sort}
          />
          <tbody>
            {model.groups.map((group) => (
              <Fragment key={group.key}>
                {model.view.groupBy !== 'none' && (
                  <tr className="task-table-group">
                    <td className="task-table-sticky" colSpan={columns.length}>
                      <span className="flex items-center gap-[6px]">
                        {groupIcon(group.key)}
                        {model.view.groupBy === 'project' ||
                        (model.view.groupBy === 'assignee' && group.key !== 'none')
                          ? group.name
                          : t(group.name)}
                        <span className="font-medium text-muted">{group.taskIds.length}</span>
                      </span>
                    </td>
                  </tr>
                )}
                {group.taskIds.map((id) => (
                  <TaskTableRow
                    key={id}
                    task={model.tasks.find((task) => task.id === id)!}
                    model={model}
                    columns={columns.map((column) => column.id)}
                  />
                ))}
              </Fragment>
            ))}
            <tr>
              <td className="task-table-sticky task-table-cell" colSpan={columns.length}>
                <button className="task-table-field text-muted" onClick={model.onNewTask}>
                  <Icon name="plus" size={14} />
                  {t('New task')}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="task-table-mobile">
        {model.tasks.map((task) => (
          <TaskTableMobileCard key={task.id} task={task} model={model} />
        ))}
      </div>
    </>
  );
}
